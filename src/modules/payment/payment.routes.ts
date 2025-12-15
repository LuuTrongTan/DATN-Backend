import express from 'express';
import * as paymentController from './payment.controller';
import { authenticate } from '../../middlewares/auth.middleware';

const router = express.Router();

// Create VNPay payment
router.post('/vnpay/create', authenticate, paymentController.createVNPayPayment);

// VNPay callback (public, no auth required)
router.get('/vnpay/callback', paymentController.vnpayCallback);

// Get payment status
router.get('/status/:order_id', authenticate, paymentController.getPaymentStatus);

export default router;


