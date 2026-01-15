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

    const { page = 1, limit = 20 } = req.query;
    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 20;
    const offset = (pageNum - 1) * limitNum;

    logger.info('Fetching notifications for user', {
      userId,
      userIdType: typeof userId,
      page: pageNum,
      limit: limitNum,
      offset,
    });

    // Get total count
    const countResult = await pool.query(
      'SELECT COUNT(*) FROM notifications WHERE user_id = $1',
      [userId]
    );
    const total = parseInt(countResult.rows[0].count);

    logger.info('Notification count query result', {
      userId,
      total,
    });

    // Get paginated notifications
    const result = await pool.query(
      `SELECT id, user_id, type, title, message, link, is_read, created_at
       FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limitNum, offset]
    );

    logger.info('Notifications fetched successfully', {
      userId,
      count: result.rows.length,
      total,
      page: pageNum,
      limit: limitNum,
    });

    return ResponseHandler.paginated(res, result.rows, {
      page: pageNum,
      limit: limitNum,
      total,
    }, 'Lấy danh sách thông báo thành công');
  } catch (error: any) {
    logger.error('Error fetching notifications', error instanceof Error ? error : new Error(String(error)), {
      userId,
      ip: req.ip,
      errorMessage: error.message,
      errorStack: error.stack,
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

// Get unread notification count
export const getUnreadCount = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;

  try {
    if (!userId) {
      return ResponseHandler.unauthorized(res, 'Người dùng chưa đăng nhập');
    }

    logger.info('Fetching unread notification count', {
      userId,
      userIdType: typeof userId,
    });

    const result = await pool.query(
      `SELECT COUNT(*) as unread_count
       FROM notifications
       WHERE user_id = $1 AND is_read = FALSE`,
      [userId]
    );

    const unreadCount = parseInt(result.rows[0]?.unread_count || '0', 10);

    logger.info('Unread notification count fetched', {
      userId,
      unreadCount,
    });

    return ResponseHandler.success(res, { unreadCount }, 'Lấy số lượng thông báo chưa đọc thành công');
  } catch (error: any) {
    logger.error('Error getting unread notification count', error instanceof Error ? error : new Error(String(error)), {
      userId,
      ip: req.ip,
      errorMessage: error.message,
      errorStack: error.stack,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi lấy số lượng thông báo chưa đọc', error);
  }
};

// Helper: create notification (cho các module khác dùng)
export const createNotification = async (params: {
  userId: string | number;
  type: NotificationType;
  title: string;
  message: string;
  link?: string | null;
}): Promise<{ success: boolean; notificationId?: number; error?: string }> => {
  const { userId, type, title, message, link } = params;
  
  // Validate input
  if (!type || !title || !message) {
    const errorMsg = 'Missing required notification fields';
    logger.error(errorMsg, new Error(errorMsg), {
      userId,
      type,
      title,
      message,
      hasType: !!type,
      hasTitle: !!title,
      hasMessage: !!message,
    });
    return { success: false, error: errorMsg };
  }
  
  // Đảm bảo userId là string (UUID)
  const userIdString = String(userId).trim();
  
  // Validate userId không rỗng và có format hợp lệ (UUID)
  if (!userIdString || userIdString === '' || userIdString === 'undefined' || userIdString === 'null') {
    const errorMsg = 'Invalid userId: empty or undefined';
    logger.error(errorMsg, new Error(errorMsg), {
      userId,
      userIdString,
      type,
      title,
    });
    return { success: false, error: errorMsg };
  }

  // Validate UUID format (basic check)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(userIdString)) {
    logger.warn('userId does not match UUID format, but proceeding anyway', {
      userId,
      userIdString,
      type,
    });
  }
  
  try {
    logger.info('Attempting to create notification', {
      userId: userIdString,
      type,
      title,
      messageLength: message.length,
      hasLink: !!link,
    });

    const result = await pool.query(
      `INSERT INTO notifications (user_id, type, title, message, link)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, user_id, type, title, message, link, is_read, created_at`,
      [userIdString, type, title, message, link || null]
    );
    
    if (!result.rows || result.rows.length === 0) {
      const errorMsg = 'Notification insert returned no rows';
      logger.error(errorMsg, new Error(errorMsg), {
        userId: userIdString,
        type,
        title,
      });
      return { success: false, error: errorMsg };
    }
    
    const notificationId = result.rows[0]?.id;
    
    logger.info('Notification created successfully', {
      notificationId,
      userId: userIdString,
      type,
      title,
      createdAt: result.rows[0]?.created_at,
    });

    return { success: true, notificationId };
  } catch (error: any) {
    const errorMsg = error.message || 'Unknown error creating notification';
    logger.error('Error creating notification', error instanceof Error ? error : new Error(String(error)), {
      userId: userIdString,
      type,
      title,
      errorMessage: errorMsg,
      errorCode: error.code,
      errorDetail: error.detail,
      errorHint: error.hint,
      stack: error.stack,
    });
    
    // Throw error để caller có thể xử lý
    return { success: false, error: errorMsg };
  }
};



