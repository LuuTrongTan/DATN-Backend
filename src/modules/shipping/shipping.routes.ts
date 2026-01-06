import express from 'express';
import * as shippingController from './shipping.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { requireRole } from '../../middlewares/auth.middleware';

const router = express.Router();

// Calculate shipping fee (public or authenticated)
router.post('/calculate', shippingController.calculateFee);

// Get shipping info for order
router.get('/order/:order_id', authenticate, shippingController.getShippingInfo);

// Update shipping info (admin/staff)
router.put('/order/:order_id', authenticate, requireRole('admin', 'staff'), shippingController.updateShippingInfo);

// Create shipping order (admin/staff)
router.post('/order', authenticate, requireRole('admin', 'staff'), shippingController.createOrder);

// Track shipping order
router.get('/track/:tracking_number', shippingController.trackOrder);

export default router;


