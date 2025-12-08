import { Response } from 'express';
import { AuthRequest } from '../../types/request.types';
import { pool } from '../../connections';
import { reviewSchema } from './reviews.validation';

// UC-14: Đánh giá sản phẩm
export const createReview = async (req: AuthRequest, res: Response) => {
  try {
    const validated = reviewSchema.parse(req.body);
    const userId = req.user!.id;

    // Check if order exists and is delivered
    const orderCheck = await pool.query(
      `SELECT id, order_status, created_at 
       FROM orders 
       WHERE id = $1 AND user_id = $2 AND order_status = 'delivered'`,
      [validated.order_id, userId]
    );

    if (orderCheck.rows.length === 0) {
      return res.status(404).json({ 
        message: 'Đơn hàng không tồn tại hoặc chưa được giao' 
      });
    }

    const order = orderCheck.rows[0];
    const orderDate = new Date(order.created_at);
    const now = new Date();
    const daysDiff = (now.getTime() - orderDate.getTime()) / (1000 * 60 * 60 * 24);

    if (daysDiff > 7) {
      return res.status(400).json({ 
        message: 'Đơn hàng đã quá 1 tuần, không thể đánh giá' 
      });
    }

    // Check if already reviewed
    const existingReview = await pool.query(
      'SELECT id FROM reviews WHERE user_id = $1 AND product_id = $2 AND order_id = $3',
      [userId, validated.product_id, validated.order_id]
    );

    if (existingReview.rows.length > 0) {
      return res.status(400).json({ message: 'Bạn đã đánh giá sản phẩm này' });
    }

    // Validate file sizes (if uploaded)
    if (validated.image_urls && validated.image_urls.length > 0) {
      // TODO: Validate image sizes
    }

    if (validated.video_url) {
      // TODO: Validate video size
    }

    const result = await pool.query(
      `INSERT INTO reviews (user_id, product_id, order_id, rating, comment, image_urls, video_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
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

    res.status(201).json({
      message: 'Đánh giá thành công',
      review: result.rows[0],
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({
        message: 'Dữ liệu không hợp lệ',
        errors: error.errors,
      });
    }
    res.status(500).json({ message: error.message });
  }
};

export const getProductReviews = async (req: AuthRequest, res: Response) => {
  try {
    const { productId } = req.params;
    const { page = 1, limit = 10 } = req.query;
    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 10;

    const result = await pool.query(
      `SELECT r.*, u.full_name, u.email
       FROM reviews r
       JOIN users u ON r.user_id = u.id
       WHERE r.product_id = $1 AND r.is_approved = TRUE
       ORDER BY r.created_at DESC
       LIMIT $2 OFFSET $3`,
      [productId, limitNum, (pageNum - 1) * limitNum]
    );

    const countResult = await pool.query(
      'SELECT COUNT(*) FROM reviews WHERE product_id = $1 AND is_approved = TRUE',
      [productId]
    );

    res.json({
      reviews: result.rows,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total: parseInt(countResult.rows[0].count),
      },
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

