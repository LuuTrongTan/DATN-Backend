import { Response } from 'express';
import { AuthRequest } from '../../types/request.types';
import { pool } from '../../connections';
import { reviewSchema } from './reviews.validation';
import { ResponseHandler } from '../../utils/response';
import { logger } from '../../utils/logging';
import { ORDER_STATUS } from '../../constants';

// UC-14: Đánh giá sản phẩm
export const createReview = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  let validated: any;
  try {
    if (!userId) {
      return ResponseHandler.error(res, 'Người dùng chưa đăng nhập', 401);
    }
    validated = reviewSchema.parse(req.body);

    // Check if order exists and is delivered (not deleted)
    const orderCheck = await pool.query(
      `SELECT id, order_status, created_at 
       FROM orders 
       WHERE id = $1 AND user_id = $2 AND order_status = $3 AND deleted_at IS NULL`,
      [validated.order_id, userId, ORDER_STATUS.DELIVERED]
    );

    if (orderCheck.rows.length === 0) {
      return ResponseHandler.notFound(res, 'Đơn hàng không tồn tại hoặc chưa được giao');
    }

    const order = orderCheck.rows[0];
    const orderDate = new Date(order.created_at);
    const now = new Date();
    const daysDiff = (now.getTime() - orderDate.getTime()) / (1000 * 60 * 60 * 24);

    if (daysDiff > 7) {
      return ResponseHandler.error(res, 'Đơn hàng đã quá 1 tuần, không thể đánh giá', 400);
    }

    // Check if already reviewed (not deleted)
    const existingReview = await pool.query(
      'SELECT id FROM reviews WHERE user_id = $1 AND product_id = $2 AND order_id = $3 AND deleted_at IS NULL',
      [userId, validated.product_id, validated.order_id]
    );

    if (existingReview.rows.length > 0) {
      return ResponseHandler.error(res, 'Bạn đã đánh giá sản phẩm này', 400);
    }

    // Validate file sizes (if uploaded)
    // Note: File size validation should be handled at upload service level
    // Image/video URLs are already validated when uploaded via uploadService
    if (validated.image_urls && validated.image_urls.length > 10) {
      return ResponseHandler.error(res, 'Tối đa 10 hình ảnh cho mỗi đánh giá', 400);
    }

    const result = await pool.query(
      `INSERT INTO reviews (user_id, product_id, order_id, rating, comment, image_urls, video_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, user_id, product_id, order_id, rating, comment, image_urls, video_url, is_approved, created_at, updated_at`,
      [
        userId,
        validated.product_id,
        validated.order_id,
        validated.rating,
        validated.comment,
        validated.image_urls || null,
        validated.video_url || null,
      ]
    );

    return ResponseHandler.created(res, result.rows[0], 'Đánh giá thành công');
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return ResponseHandler.validationError(res, error.errors);
    }
    logger.error('Error creating review', error instanceof Error ? error : new Error(String(error)), {
      userId,
      productId: validated.product_id,
      orderId: validated.order_id,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi tạo đánh giá', error);
  }
};

export const getProductReviews = async (req: AuthRequest, res: Response) => {
  const { productId } = req.params;
  try {
    const { page = 1, limit = 10 } = req.query;
    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 10;

    const result = await pool.query(
      `SELECT r.id, r.user_id, r.product_id, r.order_id, r.rating, r.comment, r.image_urls, r.video_url, r.is_approved, r.created_at, r.updated_at, u.full_name, u.email
       FROM reviews r
       JOIN users u ON r.user_id = u.id
       WHERE r.product_id = $1 AND r.is_approved = TRUE AND r.deleted_at IS NULL
       ORDER BY r.created_at DESC
       LIMIT $2 OFFSET $3`,
      [productId, limitNum, (pageNum - 1) * limitNum]
    );

    const countResult = await pool.query(
      'SELECT COUNT(*) FROM reviews WHERE product_id = $1 AND is_approved = TRUE AND deleted_at IS NULL',
      [productId]
    );

    const total = parseInt(countResult.rows[0].count);

    return ResponseHandler.paginated(res, result.rows, {
      page: pageNum,
      limit: limitNum,
      total,
    }, 'Lấy danh sách đánh giá thành công');
  } catch (error: any) {
    logger.error('Error fetching product reviews', error instanceof Error ? error : new Error(String(error)), {
      productId,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi lấy danh sách đánh giá', error);
  }
};

