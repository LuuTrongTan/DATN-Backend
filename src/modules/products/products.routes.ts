import express from 'express';
import * as productsController from './products.controller';
import * as variantsController from './product-variants.controller';
import { authenticate, optionalAuthenticate, requireRole } from '../../middlewares/auth.middleware';
import { productCreateMiddleware } from './products.upload';

const router = express.Router();

// UC-07: Tìm kiếm và lọc sản phẩm (public, nhưng có thể kèm user để biết wishlist)
router.get('/search', optionalAuthenticate, productsController.searchProducts);
router.get('/categories', productsController.getCategories);
router.get('/categories/:id', productsController.getCategoryById);
router.get('/:id', optionalAuthenticate, productsController.getProductById);
router.get('/', optionalAuthenticate, productsController.getProducts);

// UC-15, UC-16, UC-17: Quản lý sản phẩm (staff/admin only)
router.post(
  '/',
  authenticate,
  requireRole('staff', 'admin'),
  productCreateMiddleware,
  productsController.createProduct
);
router.put('/:id', authenticate, requireRole('staff', 'admin'), productsController.updateProduct);
router.delete('/:id', authenticate, requireRole('staff', 'admin'), productsController.deleteProduct);

// Variants routes
router.get('/:product_id/variants', optionalAuthenticate, variantsController.getVariantsByProduct);
router.get('/variants/:id', optionalAuthenticate, variantsController.getVariantById);
router.post('/:product_id/variants', authenticate, requireRole('staff', 'admin'), variantsController.createVariant);
router.put('/variants/:id', authenticate, requireRole('staff', 'admin'), variantsController.updateVariant);
router.delete('/variants/:id', authenticate, requireRole('staff', 'admin'), variantsController.deleteVariant);

export default router;

