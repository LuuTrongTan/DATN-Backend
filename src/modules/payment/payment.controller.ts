import { Response } from 'express';
import { AuthRequest } from '../../types/request.types';
import { pool } from '../../connections';
import { createPaymentUrl, verifyPaymentCallback } from './vnpay.service';
import { ResponseHandler } from '../../utils/response';
import { logger } from '../../utils/logging';
import { ORDER_STATUS, PAYMENT_STATUS } from '../../constants';
import { createNotification } from '../notifications/notifications.controller';
import { checkAndSendLowStockAlert } from '../../utils/email.service';

// Create VNPay payment URL
export const createVNPayPayment = async (req: AuthRequest, res: Response) => {
  const order_id = req.body.order_id;
  const userId = req.user?.id;
  try {
    if (!userId) {
      return ResponseHandler.error(res, 'Người dùng chưa đăng nhập', 401);
    }

    if (!order_id) {
      return ResponseHandler.error(res, 'order_id là bắt buộc', 400);
    }

    // Get order (not deleted)
    const orderResult = await pool.query(
      'SELECT id, order_number, total_amount, payment_status, user_id FROM orders WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
      [order_id, userId]
    );

    if (orderResult.rows.length === 0) {
      return ResponseHandler.notFound(res, 'Đơn hàng không tồn tại');
    }

    const order = orderResult.rows[0];

    if (order.payment_status === PAYMENT_STATUS.PAID) {
      return ResponseHandler.error(res, 'Đơn hàng đã được thanh toán', 400);
    }

    // Create payment URL
    const paymentUrl = createPaymentUrl(
      order.id,
      order.order_number,
      parseFloat(order.total_amount),
      `Thanh toan don hang ${order.order_number}`,
      'other',
      'vn',
      req.ip || '127.0.0.1'
    );

    if (!paymentUrl) {
      return ResponseHandler.error(res, 'VNPay chưa được cấu hình. Vui lòng liên hệ quản trị viên.', 500);
    }

    return ResponseHandler.success(res, { payment_url: paymentUrl }, 'Tạo URL thanh toán thành công');
  } catch (error: any) {
    logger.error('Error creating VNPay payment', error instanceof Error ? error : new Error(String(error)), {
      orderId: order_id,
      userId,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi tạo URL thanh toán', error);
  }
};

// VNPay callback handler
export const vnpayCallback = async (req: AuthRequest, res: Response) => {
  try {
    const verification = verifyPaymentCallback(req.query as Record<string, string>);

    if (!verification.isValid) {
      logger.warn('VNPay callback verification failed', { query: req.query });
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      return res.redirect(`${frontendUrl}/orders?payment=error`);
    }

    if (!verification.orderNumber) {
      logger.warn('VNPay callback missing order number', { query: req.query });
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      return res.redirect(`${frontendUrl}/orders?payment=error`);
    }

    // Find order by order_number (not deleted)
    const orderResult = await pool.query(
      `SELECT id, user_id, order_number, payment_status, order_status, total_amount 
       FROM orders 
       WHERE order_number = $1 AND deleted_at IS NULL`,
      [verification.orderNumber]
    );

    if (orderResult.rows.length === 0) {
      logger.warn('VNPay callback order not found', { orderNumber: verification.orderNumber });
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      return res.redirect(`${frontendUrl}/orders?payment=error`);
    }

    const order = orderResult.rows[0];

    // Bọc xử lý trong transaction để tránh race & hỗ trợ hoàn kho khi thất bại
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Khóa đơn hàng
      const lockedOrderResult = await client.query(
        `SELECT id, user_id, order_number, payment_status, order_status, total_amount 
         FROM orders 
         WHERE id = $1 FOR UPDATE`,
        [order.id]
      );

      if (lockedOrderResult.rows.length === 0) {
        await client.query('ROLLBACK');
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        return res.redirect(`${frontendUrl}/orders?payment=error`);
      }

      const lockedOrder = lockedOrderResult.rows[0];

      // Nếu đã trả tiền rồi thì bỏ qua (idempotent)
      if (lockedOrder.payment_status === PAYMENT_STATUS.PAID) {
        await client.query('COMMIT');
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        const redirectUrl =
          verification.responseCode === '00'
            ? `${frontendUrl}/orders/${lockedOrder.id}?payment=success`
            : `${frontendUrl}/orders/${lockedOrder.id}?payment=failed`;
        return res.redirect(redirectUrl);
      }

      // Đối soát số tiền
      const callbackAmount = verification.amount ?? 0;
      const orderAmount = parseFloat(lockedOrder.total_amount);
      if (verification.responseCode === '00' && Math.abs(callbackAmount - orderAmount) > 0.01) {
        logger.warn('VNPay amount mismatch', {
          orderNumber: verification.orderNumber,
          callbackAmount,
          orderAmount,
        });
        await client.query('ROLLBACK');
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        return res.redirect(`${frontendUrl}/orders/${lockedOrder.id}?payment=error`);
      }

      if (verification.responseCode === '00') {
        // Payment successful
        await client.query(
          `UPDATE orders 
           SET payment_status = $1, 
               order_status = CASE WHEN order_status = $2 THEN $3 ELSE order_status END,
               updated_at = NOW()
           WHERE id = $4`,
          [PAYMENT_STATUS.PAID, ORDER_STATUS.PENDING, ORDER_STATUS.CONFIRMED, lockedOrder.id]
        );

        await client.query('COMMIT');
        logger.info('Payment successful', { orderNumber: verification.orderNumber, transactionId: verification.transactionId });

        // Send notification to user
        try {
          await createNotification({
            userId: lockedOrder.user_id,
            type: 'payment_success',
            title: 'Thanh toán thành công',
            message: `Thanh toán cho đơn hàng ${lockedOrder.order_number} đã thành công. Đơn hàng của bạn đã được xác nhận.`,
            link: `/orders/${lockedOrder.id}`,
          });
        } catch (error: any) {
          // Log error but don't fail the request
          logger.error('Failed to create payment success notification', error instanceof Error ? error : new Error(String(error)), {
            orderId: lockedOrder.id,
            orderNumber: lockedOrder.order_number,
            userId: lockedOrder.user_id,
          });
        }
      } else {
        // Payment failed: hoàn kho (do đã trừ khi tạo đơn)
        const orderItems = await client.query(
          `SELECT product_id, variant_id, quantity FROM order_items WHERE order_id = $1`,
          [lockedOrder.id]
        );

        for (const item of orderItems.rows) {
          let stockQuery: string;
          let stockParams: any[];
          if (item.variant_id) {
            stockQuery = 'SELECT stock_quantity FROM product_variants WHERE id = $1 FOR UPDATE';
            stockParams = [item.variant_id];
          } else {
            stockQuery = 'SELECT stock_quantity FROM products WHERE id = $1 FOR UPDATE';
            stockParams = [item.product_id];
          }

          const stockResult = await client.query(stockQuery, stockParams);
          if (stockResult.rows.length === 0) {
            // Không tìm thấy sản phẩm/biến thể, bỏ qua để không chặn toàn bộ
            continue;
          }

          const currentStock = parseInt(stockResult.rows[0].stock_quantity);
          const newStock = currentStock + item.quantity;

          if (item.variant_id) {
            await client.query(
              'UPDATE product_variants SET stock_quantity = $1 WHERE id = $2',
              [newStock, item.variant_id]
            );
            // Check and send low stock alert (outside transaction)
            checkAndSendLowStockAlert(item.product_id, item.variant_id, newStock, 10).catch(err => {
              logger.error('Failed to check low stock alert', err instanceof Error ? err : new Error(String(err)));
            });
          } else {
            await client.query('UPDATE products SET stock_quantity = $1 WHERE id = $2', [newStock, item.product_id]);
            // Check and send low stock alert (outside transaction)
            checkAndSendLowStockAlert(item.product_id, null, newStock, 10).catch(err => {
              logger.error('Failed to check low stock alert', err instanceof Error ? err : new Error(String(err)));
            });
          }

        }

        // Cập nhật trạng thái thanh toán khi thất bại:
        // - payment_status: FAILED
        // - Nếu đơn đang PENDING thì chuyển sang CANCELLED, ngược lại giữ nguyên order_status
        await client.query(
          `UPDATE orders 
           SET payment_status = $1, 
               order_status = CASE WHEN order_status = $2 THEN $3 ELSE order_status END,
               updated_at = NOW()
           WHERE id = $4`,
          [PAYMENT_STATUS.FAILED, ORDER_STATUS.PENDING, ORDER_STATUS.CANCELLED, lockedOrder.id]
        );

        await client.query('COMMIT');

        logger.warn('Payment failed', { orderNumber: verification.orderNumber, responseCode: verification.responseCode });

        // Send notification to user
        try {
          await createNotification({
            userId: lockedOrder.user_id,
            type: 'payment_failed',
            title: 'Thanh toán thất bại',
            message: `Thanh toán cho đơn hàng ${lockedOrder.order_number} đã thất bại. Vui lòng thử lại hoặc liên hệ hỗ trợ.`,
            link: `/orders/${lockedOrder.id}`,
          });
        } catch (error: any) {
          // Log error but don't fail the request
          logger.error('Failed to create payment failed notification', error instanceof Error ? error : new Error(String(error)), {
            orderId: lockedOrder.id,
            orderNumber: lockedOrder.order_number,
            userId: lockedOrder.user_id,
          });
        }
      }
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      // @ts-ignore
      client?.release();
    }

    // Redirect to frontend (dựa trên trạng thái thực tế sau khi xử lý ở trên)
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const redirectUrl =
      verification.responseCode === '00'
        ? `${frontendUrl}/orders/${order.id}?payment=success`
        : `${frontendUrl}/orders/${order.id}?payment=failed`;

    return res.redirect(redirectUrl);
  } catch (error: any) {
    logger.error('Error processing VNPay callback', { error: error.message });
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/orders?payment=error`);
  }
};

// Get payment status
export const getPaymentStatus = async (req: AuthRequest, res: Response) => {
  const { order_id } = req.params;
  const userId = req.user?.id;
  try {
    if (!userId) {
      return ResponseHandler.error(res, 'Người dùng chưa đăng nhập', 401);
    }

    const result = await pool.query(
      'SELECT payment_status, payment_method FROM orders WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
      [order_id, userId]
    );

    if (result.rows.length === 0) {
      return ResponseHandler.notFound(res, 'Đơn hàng không tồn tại');
    }

    return ResponseHandler.success(res, result.rows[0], 'Lấy trạng thái thanh toán thành công');
  } catch (error: any) {
    logger.error('Error fetching payment status', error instanceof Error ? error : new Error(String(error)), {
      orderId: order_id,
      userId,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi lấy trạng thái thanh toán', error);
  }
};


