import express from 'express';
import { authenticate } from '../../middlewares/auth.middleware';
import { getNotifications, markAsRead, markAllAsRead } from './notifications.controller';

const router = express.Router();

// All notification routes require authentication
router.use(authenticate);

router.get('/', getNotifications);
router.post('/read-all', markAllAsRead);
router.post('/:id/read', markAsRead);

export default router;


