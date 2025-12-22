import { Response } from 'express';
import { pool } from '../../connections';
import { AuthRequest } from '../../types/request.types';
import { ResponseHandler } from '../../utils/response';
import { logger } from '../../utils/logging';
import { NotificationType } from '../../connections/db/models';

// Get notifications for current user
export const getNotifications = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  try {
    if (!userId) {
      return ResponseHandler.unauthorized(res, 'Người dùng chưa đăng nhập');
    }

    const result = await pool.query(
      `SELECT id, user_id, type, title, message, link, is_read, created_at
       FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [userId]
    );

    return ResponseHandler.success(res, result.rows, 'Lấy danh sách thông báo thành công');
  } catch (error: any) {
    logger.error('Error fetching notifications', error instanceof Error ? error : new Error(String(error)), {
      userId,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi lấy danh sách thông báo', error);
  }
};

// Mark notification as read
export const markAsRead = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  const { id } = req.params;

  try {
    if (!userId) {
      return ResponseHandler.unauthorized(res, 'Người dùng chưa đăng nhập');
    }

    // Parse id to integer since notifications.id is integer type
    const notificationId = parseInt(id, 10);
    if (isNaN(notificationId)) {
      return ResponseHandler.badRequest(res, 'ID thông báo không hợp lệ');
    }

    const result = await pool.query(
      `UPDATE notifications
       SET is_read = TRUE
       WHERE id = $1 AND user_id = $2
       RETURNING id, user_id, type, title, message, link, is_read, created_at`,
      [notificationId, userId]
    );

    if (result.rows.length === 0) {
      return ResponseHandler.notFound(res, 'Thông báo không tồn tại');
    }

    return ResponseHandler.success(res, result.rows[0], 'Đánh dấu đã đọc thành công');
  } catch (error: any) {
    logger.error('Error marking notification as read', error instanceof Error ? error : new Error(String(error)), {
      notificationId: id,
      userId,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi đánh dấu đã đọc', error);
  }
};

// Mark all notifications as read
export const markAllAsRead = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;

  try {
    if (!userId) {
      return ResponseHandler.unauthorized(res, 'Người dùng chưa đăng nhập');
    }

    await pool.query(
      `UPDATE notifications
       SET is_read = TRUE
       WHERE user_id = $1 AND is_read = FALSE`,
      [userId]
    );

    return ResponseHandler.success(res, null, 'Đã đánh dấu tất cả thông báo là đã đọc');
  } catch (error: any) {
    logger.error('Error marking all notifications as read', error instanceof Error ? error : new Error(String(error)), {
      userId,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi đánh dấu tất cả thông báo là đã đọc', error);
  }
};

// Helper: create notification (cho các module khác dùng)
export const createNotification = async (params: {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string | null;
}) => {
  const { userId, type, title, message, link } = params;
  try {
    await pool.query(
      `INSERT INTO notifications (user_id, type, title, message, link)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, type, title, message, link || null]
    );
  } catch (error: any) {
    logger.error('Error creating notification', error instanceof Error ? error : new Error(String(error)), {
      userId,
      type,
      title,
    });
  }
};



