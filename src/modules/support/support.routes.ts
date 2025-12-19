import express from 'express';
import { placeholderSupportController } from './support.controller';
import { authenticate } from '../../middlewares/auth.middleware';

const router = express.Router();

// All support routes require authentication
router.use(authenticate);

// Toàn bộ flow support ticket đã bị loại bỏ.
// Giữ 1 route placeholder để tránh 404 bất ngờ nếu FE cũ còn gọi.
router.all('*', (_req, res) => {
  res.status(410).json({
    success: false,
    message: placeholderSupportController(),
  });
});

export default router;

