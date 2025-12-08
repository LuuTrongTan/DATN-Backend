import express from 'express';
import * as uploadController from './upload.controller';
import { authenticate, requireRole } from '../../middlewares/auth.middleware';

const router = express.Router();

// All upload routes require authentication
router.use(authenticate);

// Upload single file (staff/admin only)
router.post(
  '/single',
  requireRole('staff', 'admin'),
  uploadController.uploadSingleMiddleware,
  uploadController.uploadSingle
);

// Upload multiple files (staff/admin only)
router.post(
  '/multiple',
  requireRole('staff', 'admin'),
  uploadController.uploadMultipleMiddleware,
  uploadController.uploadMultiple
);

export default router;

