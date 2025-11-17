import express from 'express';
import * as reviewsController from './reviews.controller';
import { authenticate } from '../../middlewares/auth.middleware';

const router = express.Router();

// UC-14: Đánh giá sản phẩm (requires auth)
router.post('/', authenticate, reviewsController.createReview);

// Get product reviews (public)
router.get('/product/:productId', reviewsController.getProductReviews);

export default router;

