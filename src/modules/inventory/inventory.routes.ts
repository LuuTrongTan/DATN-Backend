import express from 'express';
import * as inventoryController from './inventory.controller';
import { authenticate } from '../../middlewares/auth.middleware';

const router = express.Router();

// All inventory routes require authentication and admin/staff role
router.post('/stock-in', authenticate, inventoryController.stockIn);
router.post('/stock-adjustment', authenticate, inventoryController.stockAdjustment);

export default router;


