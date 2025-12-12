import { Response } from 'express';
import { AuthRequest } from '../../types/request.types';
import { pool } from '../../connections';

// Get all reviews (admin/staff) - including unapproved
export const getAllReviews = async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 20, is_approved, product_id } = req.query;
    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 20;

    let query = `
      SELECT r.*, u.full_name, u.email, p.name as product_name
      FROM reviews r
      JOIN users u ON r.user_id = u.id
      JOIN products p ON r.product_id = p.id
      WHERE 1=1
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
    let countQuery = 'SELECT COUNT(*) FROM reviews WHERE 1=1';
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

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Approve review
export const approveReview = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'UPDATE reviews SET is_approved = TRUE, updated_at = NOW() WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Đánh giá không tồn tại',
      });
    }

    res.json({
      success: true,
      message: 'Phê duyệt đánh giá thành công',
      data: result.rows[0],
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Reject/Delete review
export const rejectReview = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    // Option 1: Mark as rejected (soft delete)
    // Option 2: Hard delete
    // We'll use soft delete by setting is_approved = FALSE and adding a note

    const result = await pool.query(
      'UPDATE reviews SET is_approved = FALSE, updated_at = NOW() WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Đánh giá không tồn tại',
      });
    }

    res.json({
      success: true,
      message: 'Từ chối đánh giá thành công',
      data: result.rows[0],
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Delete review (hard delete)
export const deleteReview = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const result = await pool.query('DELETE FROM reviews WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Đánh giá không tồn tại',
      });
    }

    res.json({
      success: true,
      message: 'Xóa đánh giá thành công',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

