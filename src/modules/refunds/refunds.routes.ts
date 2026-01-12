import express from 'express';
import * as refundsController from './refunds.controller';
import { authenticate, requireRole } from '../../middlewares/auth.middleware';

const router = express.Router();

// All refund routes require authentication
router.use(authenticate);

// Tạo refund (authenticated)
router.post('/', refundsController.createRefund);

// Lấy danh sách refunds (authenticated - customer: chỉ của mình, admin: tất cả)
router.get('/', refundsController.getRefunds);

// Lấy refund theo ID (authenticated)
router.get('/:id', refundsController.getRefundById);

// Cập nhật refund status (admin/staff only)
router.put('/:id/status', requireRole('staff', 'admin'), refundsController.updateRefundStatus);

// Hủy refund (authenticated - customer only, nếu status = pending)
router.post('/:id/cancel', refundsController.cancelRefund);

export default router;
