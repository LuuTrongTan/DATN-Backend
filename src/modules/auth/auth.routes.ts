import express from 'express';
import * as authController from './auth.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { rateLimiters } from '../../middlewares/rateLimit.middleware';

const router = express.Router();

// UC-01: Đăng ký (có rate limiting)
router.post('/register', rateLimiters.auth, authController.register);

// UC-02: Gửi lại mã xác nhận (có rate limiting)
router.post('/resend-verification', rateLimiters.verification, authController.resendVerification);

// UC-03: Xác thực
router.post('/verify', authController.verify);

// Firebase Phone Auth: Verify Firebase ID token
router.post('/verify-firebase-phone', authController.verifyFirebasePhone);

// UC-04: Quên mật khẩu (có rate limiting)
router.post('/forgot-password', rateLimiters.auth, authController.forgotPassword);

// UC-05: Đăng nhập (có rate limiting)
router.post('/login', rateLimiters.auth, authController.login);

// UC-06: Đổi mật khẩu
router.post('/change-password', authenticate, authController.changePassword);

// Reset Password (sau khi có code từ forgot-password)
router.post('/reset-password', authController.resetPassword);

// Logout
router.post('/logout', authenticate, authController.logout);

// Update Profile
router.put('/profile', authenticate, authController.updateProfile);

// Verify Password (re-authenticate)
router.post('/verify-password', authenticate, authController.verifyPassword);

// Refresh Token
router.post('/refresh-token', authController.refreshToken);

// Deactivate Account
router.post('/deactivate', authenticate, authController.deactivateAccount);

// Delete Account (cần verify password)
router.delete('/account', authenticate, authController.deleteAccount);

// Get current user
router.get('/me', authenticate, authController.getCurrentUser);

export default router;

