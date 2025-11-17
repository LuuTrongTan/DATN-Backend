import express from 'express';
import * as cartController from './cart.controller';
import { authenticate } from '../../middlewares/auth.middleware';

const router = express.Router();

// All cart routes require authentication
router.use(authenticate);

// UC-08: Thêm sản phẩm vào giỏ hàng
router.post('/', cartController.addToCart);

// UC-09: Lấy sản phẩm trong giỏ hàng
router.get('/', cartController.getCart);

// UC-10: Xóa sản phẩm khỏi giỏ hàng
router.delete('/:id', cartController.removeFromCart);

// UC-11: Sửa sản phẩm trong giỏ hàng
router.put('/:id', cartController.updateCartItem);

export default router;

