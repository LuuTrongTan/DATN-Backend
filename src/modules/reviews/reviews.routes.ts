import express from 'express';
import * as reviewsController from './reviews.controller';
import * as reviewsAdminController from './reviews.admin.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { requireRole } from '../../middlewares/auth.middleware';

const router = express.Router();

// UC-14: Đánh giá sản phẩm (requires auth)
router.post('/', authenticate, reviewsController.createReview);

// Get product reviews (public)
router.get('/product/:productId', reviewsController.getProductReviews);

// Admin routes
router.get('/admin/all', authenticate, requireRole('admin', 'staff'), reviewsAdminController.getAllReviews);
router.put('/admin/:id/approve', authenticate, requireRole('admin', 'staff'), reviewsAdminController.approveReview);
router.put('/admin/:id/reject', authenticate, requireRole('admin', 'staff'), reviewsAdminController.rejectReview);
router.delete('/admin/:id', authenticate, requireRole('admin', 'staff'), reviewsAdminController.deleteReview);

export default router;

