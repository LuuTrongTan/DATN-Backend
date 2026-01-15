import { Response } from 'express';
import { AuthRequest } from '../../types/request.types';
import { pool } from '../../connections';
import { ResponseHandler } from '../../utils/response';
import { logger } from '../../utils/logging';
import { ORDER_STATUS, PAYMENT_STATUS } from '../../constants';
import { createVNPayPaymentUrl, verifyVNPayCallback } from './vnpay.service';
import { createMockVNPayCallback, logMockPayment } from './vnpay.mock.service';
import { createNotification } from '../notifications/notifications.controller';
import { checkAndSendLowStockAlert, sendOrderConfirmationEmail, sendOrderStatusUpdateEmail } from '../../utils/email.service';

// API tạo thanh toán VNPay
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

    // Lấy IP của khách hàng
    // VNPay chỉ chấp nhận IPv4, không chấp nhận IPv6 (::1)
    let ipAddr = req.ip || req.socket.remoteAddress || '127.0.0.1';
    // Convert IPv6 localhost về IPv4
    if (ipAddr === '::1' || ipAddr === '::ffff:127.0.0.1') {
      ipAddr = '127.0.0.1';
    }
    // Loại bỏ IPv6 prefix nếu có
    if (ipAddr.startsWith('::ffff:')) {
      ipAddr = ipAddr.replace('::ffff:', '');
    }

    const vnpayResult = await createVNPayPaymentUrl(
      order.id,
      order.order_number,
      parseFloat(order.total_amount),
      `Thanh toan don hang ${order.order_number}`, // Dùng tiếng Việt không dấu để tránh lỗi sanitize
      ipAddr,
      'vn'
    );

    if (!vnpayResult || !vnpayResult.paymentUrl) {
      return ResponseHandler.error(
        res,
        'VNPay chưa được cấu hình hoặc tạo URL thanh toán thất bại. Vui lòng liên hệ quản trị viên.',
        500
      );
    }

    return ResponseHandler.success(
      res,
      { payment_url: vnpayResult.paymentUrl },
      'Tạo URL thanh toán VNPay thành công'
    );
  } catch (error: any) {
    logger.error(
      'Error creating VNPay payment',
      error instanceof Error ? error : new Error(String(error)),
      {
        orderId: order_id,
        userId,
        ip: req.ip,
      }
    );
    return ResponseHandler.internalError(res, 'Lỗi khi tạo URL thanh toán VNPay', error);
  }
};

// ReturnURL từ VNPay - Xử lý cập nhật database nếu IPN chưa được gọi
// Theo tài liệu VNPay: ReturnURL và IPN URL đều có thể cập nhật trạng thái
// Nếu IPN URL không được gọi, ReturnURL sẽ xử lý để đảm bảo database được cập nhật
export const vnpayReturn = async (req: AuthRequest, res: Response) => {
  try {
    logger.info('VNPay return URL called', {
      query: req.query,
      orderNumber: req.query.vnp_TxnRef,
      responseCode: req.query.vnp_ResponseCode,
    });

    // Xử lý cập nhật database giống như IPN URL
    // Vì IPN URL có thể không được gọi hoặc bị delay
    const params = req.query;
    const verification = verifyVNPayCallback(params as Record<string, any>);

    if (!verification.isValid) {
      logger.warn('VNPay ReturnURL verification failed', {
        orderNumber: params['vnp_TxnRef'],
        responseCode: params['vnp_ResponseCode'],
      });
      // Vẫn trả về OK để không làm gián đoạn flow
      return res.status(200).send('OK');
    }

    if (!verification.orderNumber) {
      logger.warn('VNPay ReturnURL missing order number');
      return res.status(200).send('OK');
    }

    // Kiểm tra và cập nhật database nếu cần
    const orderResult = await pool.query(
      `SELECT id, user_id, order_number, payment_status, order_status, total_amount 
       FROM orders 
       WHERE order_number = $1 AND deleted_at IS NULL`,
      [verification.orderNumber]
    );

    if (orderResult.rows.length === 0) {
      logger.warn('VNPay ReturnURL order not found', { orderNumber: verification.orderNumber });
      return res.status(200).send('OK');
    }

    const order = orderResult.rows[0];

    // Nếu đã thanh toán rồi thì không cần xử lý lại
    if (order.payment_status === PAYMENT_STATUS.PAID) {
      logger.info('VNPay ReturnURL: Order already paid', { orderNumber: verification.orderNumber });
      return res.status(200).send('OK');
    }

    // Chỉ cập nhật nếu thanh toán thành công
    if (verification.responseCode === '00') {
      const callbackAmount = verification.amount ?? 0;
      const orderAmount = parseFloat(order.total_amount);

      // Kiểm tra số tiền
      if (Math.abs(callbackAmount - orderAmount) > 0.01) {
        logger.warn('VNPay ReturnURL amount mismatch', {
          orderNumber: verification.orderNumber,
          callbackAmount,
          orderAmount,
        });
        return res.status(200).send('OK');
      }

      // Cập nhật database
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const updateResult = await client.query(
          `UPDATE orders 
           SET payment_status = $1, 
               order_status = CASE WHEN order_status = $2 THEN $3 ELSE order_status END,
               updated_at = NOW()
           WHERE id = $4 AND payment_status != $1
           RETURNING id, payment_status, order_status`,
          [PAYMENT_STATUS.PAID, ORDER_STATUS.PENDING, ORDER_STATUS.CONFIRMED, order.id]
        );

          if (updateResult.rowCount && updateResult.rowCount > 0) {
          // Lưu thông tin giao dịch
          try {
            await client.query(
              `INSERT INTO payment_transactions 
               (order_id, transaction_id, payment_gateway, amount, status, created_at)
               VALUES ($1, $2, $3, $4, $5, NOW())
               ON CONFLICT (transaction_id) DO NOTHING`,
              [
                order.id,
                verification.transactionNo || `VNPAY_${Date.now()}`,
                'vnpay',
                callbackAmount,
                'success',
              ]
            );
          } catch (txError: any) {
            logger.warn('Failed to save payment transaction in ReturnURL', { error: txError.message });
          }

          await client.query('COMMIT');
          logger.info('VNPay ReturnURL: Order status updated successfully', {
            orderId: order.id,
            orderNumber: verification.orderNumber,
            transactionNo: verification.transactionNo,
          });

          // Tạo notification và gửi email (giống IPN)
          try {
            await createNotification({
              userId: order.user_id,
              type: 'payment_success',
              title: 'Thanh toán thành công',
              message: `Thanh toán cho đơn hàng ${order.order_number} đã thành công. Đơn hàng của bạn đã được xác nhận.`,
              link: `/orders/${order.id}`,
            });
          } catch (error: any) {
            logger.error('Failed to create notification in ReturnURL', { error: error.message });
          }

          // Gửi email (async, không block response)
          // ... email code sẽ được gửi sau
        } else {
          await client.query('COMMIT');
          logger.info('VNPay ReturnURL: Order already updated by IPN', {
            orderNumber: verification.orderNumber,
          });
        }
      } catch (err) {
        await client.query('ROLLBACK');
        logger.error('VNPay ReturnURL: Transaction error', { error: err instanceof Error ? err.message : String(err) });
      } finally {
        // @ts-ignore
        client?.release();
      }
    }

    return res.status(200).send('OK');
  } catch (error: any) {
    logger.error('Error processing VNPay return URL', { error: error.message });
    return res.status(200).send('OK');
  }
};

// IPN URL từ VNPay (VNPay gửi thông báo kết quả thanh toán)
// Theo tài liệu: IPN URL nhận thông tin qua query string (GET) hoặc form data (POST)
// Phải trả về response ngay lập tức với format: { RspCode: string, Message: string }
export const vnpayIpn = async (req: AuthRequest, res: Response) => {
  try {
    // Log để debug - IPN được gọi
    logger.info('VNPay IPN called', {
      method: req.method,
      query: req.query,
      body: req.body,
      headers: {
        'user-agent': req.headers['user-agent'],
        'x-forwarded-for': req.headers['x-forwarded-for'],
      },
    });

    // VNPay có thể gửi qua query (GET) hoặc body (POST), kiểm tra cả hai
    // Ưu tiên query string trước, sau đó mới đến body
    const params = { ...req.query, ...req.body };
    
    logger.debug('VNPay IPN params received', {
      paramsKeys: Object.keys(params),
      vnp_TxnRef: params['vnp_TxnRef'],
      vnp_ResponseCode: params['vnp_ResponseCode'],
      vnp_TransactionStatus: params['vnp_TransactionStatus'],
      vnp_Amount: params['vnp_Amount'],
    });

    const verification = verifyVNPayCallback(params as Record<string, any>);

    if (!verification.isValid) {
      logger.warn('VNPay IPN verification failed', { 
        params: {
          vnp_TxnRef: params['vnp_TxnRef'],
          vnp_ResponseCode: params['vnp_ResponseCode'],
          vnp_SecureHash: params['vnp_SecureHash'],
        },
        verification 
      });
      return res.status(200).json({ RspCode: '97', Message: 'Checksum failed' });
    }

    if (!verification.orderNumber) {
      logger.warn('VNPay IPN missing order number', { params, verification });
      return res.status(200).json({ RspCode: '99', Message: 'Missing order number' });
    }

    logger.info('VNPay IPN verification successful', {
      orderNumber: verification.orderNumber,
      responseCode: verification.responseCode,
      amount: verification.amount,
      transactionNo: verification.transactionNo,
    });

    const orderResult = await pool.query(
      `SELECT id, user_id, order_number, payment_status, order_status, total_amount 
       FROM orders 
       WHERE order_number = $1 AND deleted_at IS NULL`,
      [verification.orderNumber]
    );

    if (orderResult.rows.length === 0) {
      logger.warn('VNPay IPN order not found', { orderNumber: verification.orderNumber });
      return res.status(200).json({ RspCode: '01', Message: 'Order not found' });
    }

    const order = orderResult.rows[0];

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const lockedOrderResult = await client.query(
        `SELECT id, user_id, order_number, payment_status, order_status, total_amount 
         FROM orders 
         WHERE id = $1 FOR UPDATE`,
        [order.id]
      );

      if (lockedOrderResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(200).json({ RspCode: '01', Message: 'Order not found' });
      }

      const lockedOrder = lockedOrderResult.rows[0];

      logger.info('VNPay IPN processing order', {
        orderId: lockedOrder.id,
        orderNumber: lockedOrder.order_number,
        currentPaymentStatus: lockedOrder.payment_status,
        currentOrderStatus: lockedOrder.order_status,
        orderAmount: lockedOrder.total_amount,
      });

      // Nếu đã trả tiền rồi thì bỏ qua (idempotent)
      if (lockedOrder.payment_status === PAYMENT_STATUS.PAID) {
        logger.info('VNPay IPN: Order already paid, skipping update', {
          orderId: lockedOrder.id,
          orderNumber: lockedOrder.order_number,
        });
        await client.query('COMMIT');
        return res.status(200).json({ RspCode: '00', Message: 'Success' });
      }

      const callbackAmount = verification.amount ?? 0;
      const orderAmount = parseFloat(lockedOrder.total_amount);
      
      logger.debug('VNPay IPN amount check', {
        callbackAmount,
        orderAmount,
        difference: Math.abs(callbackAmount - orderAmount),
      });
      
      // ResponseCode = '00' nghĩa là thanh toán thành công
      if (verification.responseCode === '00') {
        // Kiểm tra số tiền
        if (Math.abs(callbackAmount - orderAmount) > 0.01) {
          logger.warn('VNPay IPN amount mismatch', {
            orderNumber: verification.orderNumber,
            orderId: lockedOrder.id,
            callbackAmount,
            orderAmount,
            difference: Math.abs(callbackAmount - orderAmount),
          });
          await client.query('ROLLBACK');
          return res.status(200).json({ RspCode: '04', Message: 'Amount mismatch' });
        }

        // Thanh toán thành công - Cập nhật trạng thái
        logger.info('VNPay IPN: Updating order status to PAID', {
          orderId: lockedOrder.id,
          orderNumber: lockedOrder.order_number,
          oldPaymentStatus: lockedOrder.payment_status,
          oldOrderStatus: lockedOrder.order_status,
        });

        const updateResult = await client.query(
          `UPDATE orders 
           SET payment_status = $1, 
               order_status = CASE WHEN order_status = $2 THEN $3 ELSE order_status END,
               updated_at = NOW()
           WHERE id = $4
           RETURNING id, payment_status, order_status`,
          [PAYMENT_STATUS.PAID, ORDER_STATUS.PENDING, ORDER_STATUS.CONFIRMED, lockedOrder.id]
        );

        logger.info('VNPay IPN: Order status updated successfully', {
          orderId: lockedOrder.id,
          orderNumber: lockedOrder.order_number,
          updatedOrder: updateResult.rows[0],
          rowsAffected: updateResult.rowCount,
        });

        // Lưu thông tin giao dịch vào payment_transactions nếu có bảng này
        try {
          await client.query(
            `INSERT INTO payment_transactions 
             (order_id, transaction_id, payment_gateway, amount, status, created_at)
             VALUES ($1, $2, $3, $4, $5, NOW())
             ON CONFLICT (transaction_id) DO NOTHING`,
            [
              lockedOrder.id,
              verification.transactionNo || `VNPAY_${Date.now()}`,
              'vnpay',
              callbackAmount,
              'success',
            ]
          );
        } catch (txError: any) {
          // Bỏ qua nếu bảng không tồn tại hoặc có lỗi
          logger.warn('Failed to save payment transaction', { error: txError.message });
        }

        await client.query('COMMIT');
        logger.info('VNPay payment successful - Transaction committed', {
          orderId: lockedOrder.id,
          orderNumber: verification.orderNumber,
          transactionNo: verification.transactionNo,
          amount: callbackAmount,
        });

        // Tạo notification cho user
        try {
          await createNotification({
            userId: lockedOrder.user_id,
            type: 'payment_success',
            title: 'Thanh toán thành công',
            message: `Thanh toán cho đơn hàng ${lockedOrder.order_number} đã thành công. Đơn hàng của bạn đã được xác nhận.`,
            link: `/orders/${lockedOrder.id}`,
          });
        } catch (error: any) {
          logger.error(
            'Failed to create payment success notification',
            error instanceof Error ? error : new Error(String(error)),
            {
              orderId: lockedOrder.id,
              orderNumber: lockedOrder.order_number,
              userId: lockedOrder.user_id,
            }
          );
        }

        // Gửi email xác nhận đơn hàng sau khi thanh toán thành công
        try {
          // Lấy thông tin đầy đủ của đơn hàng để gửi email
          const orderDetailsResult = await pool.query(
            `SELECT 
              o.id,
              o.order_number,
              o.total_amount,
              o.created_at,
              o.shipping_address,
              u.full_name,
              u.email
            FROM orders o
            JOIN users u ON o.user_id = u.id
            WHERE o.id = $1`,
            [lockedOrder.id]
          );

          if (orderDetailsResult.rows.length > 0) {
            const orderDetails = orderDetailsResult.rows[0];
            
            // Lấy danh sách sản phẩm trong đơn hàng
            const orderItemsResult = await pool.query(
              `SELECT 
                p.name as product_name,
                oi.quantity,
                oi.price
              FROM order_items oi
              JOIN products p ON oi.product_id = p.id
              WHERE oi.order_id = $1`,
              [lockedOrder.id]
            );

            const items = orderItemsResult.rows.map((item: any) => ({
              productName: item.product_name,
              quantity: item.quantity,
              price: parseFloat(item.price),
            }));

            // Gửi email xác nhận đơn hàng
            await sendOrderConfirmationEmail({
              orderNumber: orderDetails.order_number,
              customerName: orderDetails.full_name || 'Khách hàng',
              customerEmail: orderDetails.email,
              orderDate: new Date(orderDetails.created_at).toLocaleString('vi-VN'),
              totalAmount: parseFloat(orderDetails.total_amount),
              shippingAddress: orderDetails.shipping_address || 'Chưa cập nhật',
              paymentMethod: 'Thanh toán online (VNPay)',
              items: items,
            });

            // Gửi email cập nhật trạng thái đơn hàng
            await sendOrderStatusUpdateEmail(
              orderDetails.email,
              orderDetails.full_name || 'Khách hàng',
              orderDetails.order_number,
              'confirmed',
              'Đơn hàng của bạn đã được xác nhận sau khi thanh toán thành công.'
            );

            logger.info('Order confirmation emails sent after successful payment', {
              orderId: lockedOrder.id,
              orderNumber: lockedOrder.order_number,
              email: orderDetails.email,
            });
          }
        } catch (emailError: any) {
          // Log lỗi nhưng không làm fail transaction
          logger.error(
            'Failed to send order confirmation email after payment',
            emailError instanceof Error ? emailError : new Error(String(emailError)),
            {
              orderId: lockedOrder.id,
              orderNumber: lockedOrder.order_number,
            }
          );
        }

        return res.status(200).json({ RspCode: '00', Message: 'Success' });
      } else {
        // Thanh toán thất bại: hoàn kho (do đã trừ khi tạo đơn)
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
            continue;
          }

          const currentStock = parseInt(stockResult.rows[0].stock_quantity);
          const newStock = currentStock + item.quantity;

          if (item.variant_id) {
            await client.query(
              'UPDATE product_variants SET stock_quantity = $1 WHERE id = $2',
              [newStock, item.variant_id]
            );
            checkAndSendLowStockAlert(item.product_id, item.variant_id, newStock, 10).catch(err => {
              logger.error(
                'Failed to check low stock alert',
                err instanceof Error ? err : new Error(String(err))
              );
            });
          } else {
            await client.query('UPDATE products SET stock_quantity = $1 WHERE id = $2', [
              newStock,
              item.product_id,
            ]);
            checkAndSendLowStockAlert(item.product_id, null, newStock, 10).catch(err => {
              logger.error(
                'Failed to check low stock alert',
                err instanceof Error ? err : new Error(String(err))
              );
            });
          }
        }

        await client.query(
          `UPDATE orders 
           SET payment_status = $1, 
               order_status = CASE WHEN order_status = $2 THEN $3 ELSE order_status END,
               updated_at = NOW()
           WHERE id = $4`,
          [PAYMENT_STATUS.FAILED, ORDER_STATUS.PENDING, ORDER_STATUS.CANCELLED, lockedOrder.id]
        );

        await client.query('COMMIT');

        logger.warn('VNPay payment failed', {
          orderNumber: verification.orderNumber,
          responseCode: verification.responseCode,
        });

        try {
          await createNotification({
            userId: lockedOrder.user_id,
            type: 'payment_failed',
            title: 'Thanh toán thất bại',
            message:
              'Thanh toán cho đơn hàng của bạn đã thất bại. Vui lòng thử lại hoặc liên hệ hỗ trợ.',
            link: `/orders/${lockedOrder.id}`,
          });
        } catch (error: any) {
          logger.error(
            'Failed to create payment failed notification',
            error instanceof Error ? error : new Error(String(error)),
            {
              orderId: lockedOrder.id,
              orderNumber: lockedOrder.order_number,
              userId: lockedOrder.user_id,
            }
          );
        }

        return res.status(200).json({ RspCode: '00', Message: 'Success' });
      }
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('VNPay IPN: Transaction rolled back due to error', {
        error: err instanceof Error ? err.message : String(err),
        orderNumber: verification.orderNumber,
        stack: err instanceof Error ? err.stack : undefined,
      });
      throw err;
    } finally {
      // @ts-ignore
      client?.release();
    }
  } catch (error: any) {
    logger.error('Error processing VNPay IPN', {
      error: error.message,
      stack: error.stack,
      query: req.query,
      body: req.body,
    });
    return res.status(200).json({ RspCode: '99', Message: 'Unknown error' });
  }
};

// API lấy trạng thái thanh toán (không phụ thuộc cổng thanh toán cụ thể)
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

// Mock VNPay Payment Page - Chỉ dùng để test local
export const mockVNPayPaymentPage = async (req: AuthRequest, res: Response) => {
  try {
    const { orderId, orderNumber, amount, description, success } = req.query;
    
    if (!orderId || !orderNumber || !amount) {
      return res.status(400).send(`
        <html>
          <head><title>Mock VNPay Payment</title></head>
          <body>
            <h1>Mock VNPay Payment Page</h1>
            <p style="color: red;">Thiếu thông tin đơn hàng. Vui lòng kiểm tra lại URL.</p>
          </body>
        </html>
      `);
    }

    const isSuccess = success !== 'false';
    const amountValue = parseFloat(amount as string);
    
    // Hiển thị trang mock payment
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Mock VNPay Payment</title>
          <meta charset="UTF-8">
          <style>
            body {
              font-family: Arial, sans-serif;
              max-width: 600px;
              margin: 50px auto;
              padding: 20px;
              background-color: #f5f5f5;
            }
            .payment-box {
              background: white;
              padding: 30px;
              border-radius: 8px;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            h1 { color: #1a73e8; }
            .info { margin: 15px 0; }
            .info strong { display: inline-block; width: 150px; }
            .button {
              background-color: #1a73e8;
              color: white;
              padding: 12px 30px;
              border: none;
              border-radius: 4px;
              cursor: pointer;
              font-size: 16px;
              margin: 10px 5px;
            }
            .button:hover { background-color: #1557b0; }
            .button-danger {
              background-color: #dc3545;
            }
            .button-danger:hover { background-color: #c82333; }
            .warning {
              background-color: #fff3cd;
              border: 1px solid #ffc107;
              padding: 15px;
              border-radius: 4px;
              margin: 20px 0;
            }
          </style>
        </head>
        <body>
          <div class="payment-box">
            <h1>🔧 Mock VNPay Payment Page</h1>
            <div class="warning">
              <strong>⚠️ Lưu ý:</strong> Đây là trang mock để test local. Không có thanh toán thật được thực hiện.
            </div>
            <div class="info">
              <strong>Mã đơn hàng:</strong> ${orderNumber}
            </div>
            <div class="info">
              <strong>Số tiền:</strong> ${amountValue.toLocaleString('vi-VN')} VND
            </div>
            <div class="info">
              <strong>Mô tả:</strong> ${description || 'Thanh toán đơn hàng'}
            </div>
            <hr style="margin: 30px 0;">
            <p>Chọn kết quả thanh toán:</p>
            <form method="POST" action="/api/payment/vnpay/mock-callback" style="display: inline;">
              <input type="hidden" name="orderId" value="${orderId}">
              <input type="hidden" name="orderNumber" value="${orderNumber}">
              <input type="hidden" name="amount" value="${amount}">
              <input type="hidden" name="success" value="true">
              <button type="submit" class="button">✅ Thanh toán thành công</button>
            </form>
            <form method="POST" action="/api/payment/vnpay/mock-callback" style="display: inline;">
              <input type="hidden" name="orderId" value="${orderId}">
              <input type="hidden" name="orderNumber" value="${orderNumber}">
              <input type="hidden" name="amount" value="${amount}">
              <input type="hidden" name="success" value="false">
              <button type="submit" class="button button-danger">❌ Thanh toán thất bại</button>
            </form>
          </div>
        </body>
      </html>
    `);
  } catch (error: any) {
    logger.error(
      'Error rendering mock VNPay payment page',
      error instanceof Error ? error : new Error(String(error))
    );
    res.status(500).send('<h1>Lỗi khi hiển thị trang mock payment</h1>');
  }
};

// Mock VNPay Callback - Chỉ dùng để test local
export const mockVNPayCallback = async (req: AuthRequest, res: Response) => {
  try {
    const { orderId, orderNumber, amount, success } = req.body;
    
    if (!orderId || !orderNumber || !amount) {
      return res.status(400).json({ error: 'Thiếu thông tin đơn hàng' });
    }

    const isSuccess = success !== 'false';
    const amountValue = parseFloat(amount);
    
    // Tạo callback data giống VNPay
    const callbackData = createMockVNPayCallback(orderNumber, amountValue, isSuccess);
    
    // Log mock payment
    logMockPayment(parseInt(orderId), orderNumber, amountValue, isSuccess);
    
    // Tạo URL callback với query params
    const params = new URLSearchParams();
    Object.entries(callbackData).forEach(([key, value]) => {
      params.append(key, String(value));
    });
    const callbackUrl = `/api/payment/vnpay/return?${params.toString()}`;
    
    // Redirect về return URL để xử lý như callback thật
    res.redirect(callbackUrl);
  } catch (error: any) {
    logger.error(
      'Error processing mock VNPay callback',
      error instanceof Error ? error : new Error(String(error))
    );
    res.status(500).json({ error: 'Lỗi khi xử lý mock callback' });
  }
};


