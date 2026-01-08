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

// Get available services (Nhanh, Chuẩn, Tiết kiệm)
router.get('/services', shippingController.getServices);

// Calculate expected delivery time
router.post('/leadtime', shippingController.calculateLeadtime);

// Get stations (bưu cục)
router.get('/stations', shippingController.getStations);

// Cancel order (admin/staff)
router.post('/cancel', authenticate, requireRole('admin', 'staff'), shippingController.cancelOrder);

// Update COD (admin/staff)
router.put('/cod', authenticate, requireRole('admin', 'staff'), shippingController.updateCOD);

// Update order (admin/staff)
router.put('/order-update', authenticate, requireRole('admin', 'staff'), shippingController.updateOrder);

export default router;


