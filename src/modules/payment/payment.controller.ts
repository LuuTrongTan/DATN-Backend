import { Response } from 'express';
import { AuthRequest } from '../../types/request.types';
import { pool } from '../../connections';
import { createPaymentUrl, verifyPaymentCallback } from './vnpay.service';
import { logger } from '../../utils/logging';

// Create VNPay payment URL
export const createVNPayPayment = async (req: AuthRequest, res: Response) => {
  try {
    const { order_id } = req.body;
    const userId = req.user!.id;

    if (!order_id) {
      return res.status(400).json({
        success: false,
        message: 'order_id là bắt buộc',
      });
    }

    // Get order
    const orderResult = await pool.query(
      'SELECT * FROM orders WHERE id = $1 AND user_id = $2',
      [order_id, userId]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Đơn hàng không tồn tại',
      });
    }

    const order = orderResult.rows[0];

    if (order.payment_status === 'paid') {
      return res.status(400).json({
        success: false,
        message: 'Đơn hàng đã được thanh toán',
      });
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
      return res.status(500).json({
        success: false,
        message: 'VNPay chưa được cấu hình. Vui lòng liên hệ quản trị viên.',
      });
    }

    res.json({
      success: true,
      payment_url: paymentUrl,
    });
  } catch (error: any) {
    logger.error('Error creating VNPay payment', { error: error.message });
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// VNPay callback handler
export const vnpayCallback = async (req: AuthRequest, res: Response) => {
  try {
    const verification = verifyPaymentCallback(req.query as Record<string, string>);

    if (!verification.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Xác thực thanh toán thất bại',
      });
    }

    if (!verification.orderNumber) {
      return res.status(400).json({
        success: false,
        message: 'Không tìm thấy mã đơn hàng',
      });
    }

    // Find order by order_number
    const orderResult = await pool.query(
      'SELECT * FROM orders WHERE order_number = $1',
      [verification.orderNumber]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy đơn hàng',
      });
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
  try {
    const { order_id } = req.params;
    const userId = req.user!.id;

    const result = await pool.query(
      'SELECT payment_status, payment_method FROM orders WHERE id = $1 AND user_id = $2',
      [order_id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Đơn hàng không tồn tại',
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};


