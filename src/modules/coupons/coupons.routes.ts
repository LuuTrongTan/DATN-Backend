import express from 'express';
import * as couponsController from './coupons.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { requireRole } from '../../middlewares/auth.middleware';

const router = express.Router();

// Admin/Staff routes
router.get('/', authenticate, requireRole('admin', 'staff'), couponsController.getCoupons);
router.get('/:id', authenticate, requireRole('admin', 'staff'), couponsController.getCouponById);
router.post('/', authenticate, requireRole('admin', 'staff'), couponsController.createCoupon);
router.put('/:id', authenticate, requireRole('admin', 'staff'), couponsController.updateCoupon);
router.delete('/:id', authenticate, requireRole('admin', 'staff'), couponsController.deleteCoupon);

// Customer route - Apply coupon
router.post('/apply', authenticate, couponsController.applyCoupon);

export default router;


