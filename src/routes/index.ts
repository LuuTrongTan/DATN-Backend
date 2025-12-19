import express from 'express';
import authRoutes from '../modules/auth/auth.routes';
import productsRoutes from '../modules/products/products.routes';
import cartRoutes from '../modules/cart/cart.routes';
import ordersRoutes from '../modules/orders/orders.routes';
import reviewsRoutes from '../modules/reviews/reviews.routes';
import adminRoutes from '../modules/admin/admin.routes';
import uploadRoutes from '../modules/upload/upload.routes';
import addressesRoutes from '../modules/addresses/addresses.routes';
import wishlistRoutes from '../modules/wishlist/wishlist.routes';
import inventoryRoutes from '../modules/inventory/inventory.routes';
import paymentRoutes from '../modules/payment/payment.routes';
import shippingRoutes from '../modules/shipping/shipping.routes';
import notificationRoutes from '../modules/notifications/notifications.routes';

const router = express.Router();

// API Routes
router.use('/auth', authRoutes);
router.use('/products', productsRoutes);
router.use('/cart', cartRoutes);
router.use('/orders', ordersRoutes);
router.use('/reviews', reviewsRoutes);
router.use('/admin', adminRoutes);
router.use('/upload', uploadRoutes);
router.use('/addresses', addressesRoutes);
router.use('/wishlist', wishlistRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/payment', paymentRoutes);
router.use('/shipping', shippingRoutes);
router.use('/notifications', notificationRoutes);

export default router;

