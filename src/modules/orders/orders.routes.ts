import express from 'express';
import * as ordersController from './orders.controller';
import { authenticate } from '../../middlewares/auth.middleware';

const router = express.Router();

// All order routes require authentication
router.use(authenticate);

// UC-12: Đặt hàng
router.post('/', ordersController.createOrder);

// UC-13: Theo dõi đơn hàng
router.get('/', ordersController.getOrders);
router.get('/:id', ordersController.getOrderById);

export default router;

