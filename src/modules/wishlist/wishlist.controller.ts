import { Response } from 'express';
import { AuthRequest } from '../../types/request.types';
import { pool } from '../../connections';
import { ResponseHandler } from '../../utils/response';
import { logger } from '../../utils/logging';

// Get wishlist for current user
export const getWishlist = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const result = await pool.query(
      `SELECT w.*, p.name, p.price, p.image_urls, p.stock_quantity, p.is_active
       FROM wishlist w
       JOIN products p ON w.product_id = p.id
       WHERE w.user_id = $1
       ORDER BY w.created_at DESC`,
      [userId]
    );

    return ResponseHandler.success(res, result.rows, 'Lấy danh sách yêu thích thành công');
  } catch (error: any) {
    logger.error('Error fetching wishlist', error instanceof Error ? error : new Error(String(error)), {
      userId: req.user?.id,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi lấy danh sách yêu thích', error);
  }
};

// Add product to wishlist
export const addToWishlist = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  const product_id = req.body.product_id;
  try {
    if (!userId) {
      return ResponseHandler.error(res, 'Người dùng chưa đăng nhập', 401);
    }

    if (!product_id) {
      return ResponseHandler.error(res, 'product_id là bắt buộc', 400);
    }

    // Check if product exists
    const productCheck = await pool.query(
      'SELECT id FROM products WHERE id = $1',
      [product_id]
    );

    if (productCheck.rows.length === 0) {
      return ResponseHandler.notFound(res, 'Sản phẩm không tồn tại');
    }

    // Check if already in wishlist
    const existingCheck = await pool.query(
      'SELECT id FROM wishlist WHERE user_id = $1 AND product_id = $2',
      [userId, product_id]
    );

    if (existingCheck.rows.length > 0) {
      return ResponseHandler.error(res, 'Sản phẩm đã có trong danh sách yêu thích', 400);
    }

    const result = await pool.query(
      `INSERT INTO wishlist (user_id, product_id)
       VALUES ($1, $2)
       RETURNING id, user_id, product_id, created_at`,
      [userId, product_id]
    );

    return ResponseHandler.created(res, result.rows[0], 'Đã thêm vào danh sách yêu thích');
  } catch (error: any) {
    if (error.code === '23505') {
      // Unique constraint violation
      return ResponseHandler.error(res, 'Sản phẩm đã có trong danh sách yêu thích', 400);
    }
    logger.error('Error adding to wishlist', error instanceof Error ? error : new Error(String(error)), {
      userId,
      productId: product_id,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi thêm vào danh sách yêu thích', error);
  }
};

// Remove product from wishlist
export const removeFromWishlist = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  const { product_id } = req.params;
  try {
    if (!userId) {
      return ResponseHandler.error(res, 'Người dùng chưa đăng nhập', 401);
    }

    const result = await pool.query(
      'DELETE FROM wishlist WHERE user_id = $1 AND product_id = $2 RETURNING id',
      [userId, product_id]
    );

    if (result.rows.length === 0) {
      return ResponseHandler.notFound(res, 'Sản phẩm không có trong danh sách yêu thích');
    }

    return ResponseHandler.success(res, null, 'Đã xóa khỏi danh sách yêu thích');
  } catch (error: any) {
    logger.error('Error removing from wishlist', error instanceof Error ? error : new Error(String(error)), {
      userId,
      productId: product_id,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi xóa khỏi danh sách yêu thích', error);
  }
};

// Check if product is in wishlist
export const checkWishlist = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  const { product_id } = req.params;
  try {
    if (!userId) {
      return ResponseHandler.error(res, 'Người dùng chưa đăng nhập', 401);
    }

    const result = await pool.query(
      'SELECT id FROM wishlist WHERE user_id = $1 AND product_id = $2',
      [userId, product_id]
    );

    return ResponseHandler.success(res, { isInWishlist: result.rows.length > 0 }, 'Kiểm tra wishlist thành công');
  } catch (error: any) {
    logger.error('Error checking wishlist', error instanceof Error ? error : new Error(String(error)), {
      userId,
      productId: product_id,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi kiểm tra wishlist', error);
  }
};


