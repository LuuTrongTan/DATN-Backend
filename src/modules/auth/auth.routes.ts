import express from 'express';
import * as authController from './auth.controller';
import { authenticate } from '../../middlewares/auth.middleware';

const router = express.Router();

// UC-01: Đăng ký
router.post('/register', authController.register);

// UC-02: Gửi lại mã xác nhận
router.post('/resend-verification', authController.resendVerification);

// UC-03: Xác thực
router.post('/verify', authController.verify);

// UC-04: Quên mật khẩu
router.post('/forgot-password', authController.forgotPassword);

// UC-05: Đăng nhập
router.post('/login', authController.login);

// UC-06: Đổi mật khẩu
router.post('/change-password', authenticate, authController.changePassword);

// Get current user
router.get('/me', authenticate, authController.getCurrentUser);

export default router;

