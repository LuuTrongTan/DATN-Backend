import { Response } from 'express';
import { AuthRequest } from '../../types/request.types';
import { pool } from '../../connections';
import { ResponseHandler } from '../../utils/response';
import { logger } from '../../utils/logging';

// Get all reviews (admin/staff) - including unapproved
export const getAllReviews = async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 20, is_approved, product_id } = req.query;
    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 20;

    let query = `
      SELECT r.id, r.user_id, r.product_id, r.order_id, r.rating, r.comment, r.image_urls, r.video_url, r.is_approved, r.created_at, r.updated_at, u.full_name, u.email, p.name as product_name
      FROM reviews r
      JOIN users u ON r.user_id = u.id
      JOIN products p ON r.product_id = p.id
      WHERE r.deleted_at IS NULL
    `;
    const params: any[] = [];
    let paramCount = 0;

    if (is_approved !== undefined) {
      paramCount++;
      query += ` AND r.is_approved = $${paramCount}`;
      params.push(is_approved === 'true');
    }

    if (product_id) {
      paramCount++;
      query += ` AND r.product_id = $${paramCount}`;
      params.push(product_id);
    }

    paramCount++;
    query += ` ORDER BY r.created_at DESC LIMIT $${paramCount}`;
    params.push(limitNum);

    paramCount++;
    query += ` OFFSET $${paramCount}`;
    params.push((pageNum - 1) * limitNum);

    const result = await pool.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM reviews WHERE deleted_at IS NULL';
    const countParams: any[] = [];
    let countParamCount = 0;

    if (is_approved !== undefined) {
      countParamCount++;
      countQuery += ` AND is_approved = $${countParamCount}`;
      countParams.push(is_approved === 'true');
    }

    if (product_id) {
      countParamCount++;
      countQuery += ` AND product_id = $${countParamCount}`;
      countParams.push(product_id);
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    return ResponseHandler.paginated(res, result.rows, {
      page: pageNum,
      limit: limitNum,
      total,
    }, 'Lấy danh sách đánh giá thành công');
  } catch (error: any) {
    logger.error('Error fetching all reviews', error instanceof Error ? error : new Error(String(error)));
    return ResponseHandler.internalError(res, 'Lỗi khi lấy danh sách đánh giá', error);
  }
};

// Approve review
export const approveReview = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  try {

    const result = await pool.query(
      'UPDATE reviews SET is_approved = TRUE, updated_at = NOW() WHERE id = $1 RETURNING id, user_id, product_id, order_id, rating, comment, image_urls, video_url, is_approved, created_at, updated_at',
      [id]
    );

    if (result.rows.length === 0) {
      return ResponseHandler.notFound(res, 'Đánh giá không tồn tại');
    }

    return ResponseHandler.success(res, result.rows[0], 'Phê duyệt đánh giá thành công');
  } catch (error: any) {
    logger.error('Error approving review', error instanceof Error ? error : new Error(String(error)), {
      reviewId: id,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi phê duyệt đánh giá', error);
  }
};

// Reject/Delete review
export const rejectReview = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  try {
    const { reason } = req.body;

    // Option 1: Mark as rejected (soft delete)
    // Option 2: Hard delete
    // We'll use soft delete by setting is_approved = FALSE and adding a note

    const result = await pool.query(
      'UPDATE reviews SET is_approved = FALSE, updated_at = NOW() WHERE id = $1 RETURNING id, user_id, product_id, order_id, rating, comment, image_urls, video_url, is_approved, created_at, updated_at',
      [id]
    );

    if (result.rows.length === 0) {
      return ResponseHandler.notFound(res, 'Đánh giá không tồn tại');
    }

    return ResponseHandler.success(res, result.rows[0], 'Từ chối đánh giá thành công');
  } catch (error: any) {
    logger.error('Error rejecting review', error instanceof Error ? error : new Error(String(error)), {
      reviewId: id,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi từ chối đánh giá', error);
  }
};

// Delete review (hard delete)
export const deleteReview = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  try {

    const result = await pool.query(
      `UPDATE reviews 
       SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id`,
      [id]
    );

    if (result.rows.length === 0) {
      return ResponseHandler.notFound(res, 'Đánh giá không tồn tại');
    }

    return ResponseHandler.success(res, null, 'Xóa đánh giá thành công');
  } catch (error: any) {
    logger.error('Error deleting review', error instanceof Error ? error : new Error(String(error)), {
      reviewId: id,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi xóa đánh giá', error);
  }
};


