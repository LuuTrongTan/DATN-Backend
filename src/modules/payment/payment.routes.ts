import express from 'express';
import * as paymentController from './payment.controller';
import { authenticate } from '../../middlewares/auth.middleware';

const router = express.Router();

// Tạo thanh toán VNPay
router.post('/vnpay/create', authenticate, paymentController.createVNPayPayment);

// ReturnURL từ VNPay (public, không cần auth) - khách hàng được redirect về sau khi thanh toán
router.get('/vnpay/return', paymentController.vnpayReturn);

// IPN URL từ VNPay (public, không cần auth) - VNPay gửi thông báo kết quả thanh toán
router.get('/vnpay/ipn', paymentController.vnpayIpn);
router.post('/vnpay/ipn', paymentController.vnpayIpn);

// Get payment status (giữ nguyên để frontend tra cứu, không phụ thuộc cổng thanh toán cụ thể)
router.get('/status/:order_id', authenticate, paymentController.getPaymentStatus);

// Mock VNPay endpoints - Chỉ dùng để test local, không cần expose ra internet
// GET: Mock payment page (simulate VNPay payment page)
router.get('/vnpay/mock-payment', paymentController.mockVNPayPaymentPage);
// POST: Mock payment callback (simulate VNPay callback)
router.post('/vnpay/mock-callback', paymentController.mockVNPayCallback);

export default router;


