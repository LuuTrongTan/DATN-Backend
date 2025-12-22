import express from 'express';
import * as adminController from './admin.controller';
import * as inventoryController from '../inventory/inventory.controller';
import { authenticate, requireRole } from '../../middlewares/auth.middleware';

const router = express.Router();

// All admin routes require admin role
router.use(authenticate);
router.use(requireRole('admin', 'staff'));

// UC-18, UC-19, UC-20: Quản lý danh mục
router.get('/categories', requireRole('admin', 'staff'), adminController.getCategoriesAdmin);
router.get('/categories/:id', requireRole('admin', 'staff'), adminController.getCategoryAdmin);
router.post('/categories', requireRole('admin', 'staff'), adminController.createCategory);
router.put('/categories/:id', requireRole('admin', 'staff'), adminController.updateCategory);
router.delete('/categories/:id', requireRole('admin', 'staff'), adminController.deleteCategory);
router.post('/categories/:id/restore', requireRole('admin', 'staff'), adminController.restoreCategoryAdmin);

// Quản lý sản phẩm (admin)
router.get('/products', requireRole('admin', 'staff'), adminController.getProductsAdmin);
router.get('/products/:id', requireRole('admin', 'staff'), adminController.getProductAdmin);

// Quản lý kho (admin)
router.post('/inventory/stock-in', requireRole('admin', 'staff'), inventoryController.stockIn);
router.post('/inventory/stock-adjustment', requireRole('admin', 'staff'), inventoryController.stockAdjustment);
router.get('/inventory/history', requireRole('admin', 'staff'), inventoryController.getStockHistory);
router.get('/inventory/alerts', requireRole('admin', 'staff'), inventoryController.getStockAlerts);
router.put('/inventory/alerts/:id/notify', requireRole('admin', 'staff'), inventoryController.markAlertAsNotified);

// UC-21: Xử lý đơn hàng
router.get('/orders', adminController.getAllOrders);
router.put('/orders/:id/status', adminController.updateOrderStatus);

// UC-22: Tạo staff (admin only)
router.post('/staff', requireRole('admin'), adminController.createStaff);

// UC-23: Quản lý staff/user (admin only)
router.get('/users', requireRole('admin'), adminController.getUsers);
router.put('/users/:id', requireRole('admin'), adminController.updateUser);

// UC-24: Thống kê và báo cáo (admin only)
router.get('/statistics', requireRole('admin'), adminController.getStatistics);

export default router;

