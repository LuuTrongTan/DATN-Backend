import express from 'express';
import * as productsController from './products.controller';
import { authenticate, requireRole } from '../../middlewares/auth.middleware';

const router = express.Router();

// UC-07: Tìm kiếm và lọc sản phẩm (public)
router.get('/search', productsController.searchProducts);
router.get('/:id', productsController.getProductById);
router.get('/', productsController.getProducts);

// UC-15, UC-16, UC-17: Quản lý sản phẩm (staff/admin only)
router.post('/', authenticate, requireRole('staff', 'admin'), productsController.createProduct);
router.put('/:id', authenticate, requireRole('staff', 'admin'), productsController.updateProduct);
router.delete('/:id', authenticate, requireRole('staff', 'admin'), productsController.deleteProduct);

export default router;

