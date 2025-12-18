import { Response } from 'express';
import { AuthRequest } from '../../types/request.types';
import { pool } from '../../connections';
import { createPaymentUrl, verifyPaymentCallback } from './vnpay.service';
import { ResponseHandler } from '../../utils/response';
import { logger } from '../../utils/logging';

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

    // Get order
    const orderResult = await pool.query(
      'SELECT id, order_number, total_amount, payment_status, user_id FROM orders WHERE id = $1 AND user_id = $2',
      [order_id, userId]
    );

    if (orderResult.rows.length === 0) {
      return ResponseHandler.notFound(res, 'Đơn hàng không tồn tại');
    }

    const order = orderResult.rows[0];

    if (order.payment_status === 'paid') {
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

    // Find order by order_number
    const orderResult = await pool.query(
      'SELECT id, order_number, payment_status, order_status FROM orders WHERE order_number = $1',
      [verification.orderNumber]
    );

    if (orderResult.rows.length === 0) {
      logger.warn('VNPay callback order not found', { orderNumber: verification.orderNumber });
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      return res.redirect(`${frontendUrl}/orders?payment=error`);
    }

    const order = orderResult.rows[0];

    // Update payment status
    if (verification.responseCode === '00') {
      // Payment successful
      await pool.query(
        `UPDATE orders 
         SET payment_status = 'paid', 
             order_status = CASE WHEN order_status = 'pending' THEN 'confirmed' ELSE order_status END,
             updated_at = NOW()
         WHERE id = $1`,
        [order.id]
      );

      logger.info('Payment successful', { orderNumber: verification.orderNumber, transactionId: verification.transactionId });
    } else {
      // Payment failed
      await pool.query(
        `UPDATE orders 
         SET payment_status = 'failed', 
             updated_at = NOW()
         WHERE id = $1`,
        [order.id]
      );

      logger.warn('Payment failed', { orderNumber: verification.orderNumber, responseCode: verification.responseCode });
    }

    // Redirect to frontend
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const redirectUrl = verification.responseCode === '00'
      ? `${frontendUrl}/orders/${order.id}?payment=success`
      : `${frontendUrl}/orders/${order.id}?payment=failed`;

    res.redirect(redirectUrl);
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
      'SELECT payment_status, payment_method FROM orders WHERE id = $1 AND user_id = $2',
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


