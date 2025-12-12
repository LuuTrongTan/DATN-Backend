import { Response } from 'express';
import { AuthRequest } from '../../types/request.types';
import { pool } from '../../connections';

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

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Add product to wishlist
export const addToWishlist = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { product_id } = req.body;

    if (!product_id) {
      return res.status(400).json({
        success: false,
        message: 'product_id là bắt buộc',
      });
    }

    // Check if product exists
    const productCheck = await pool.query(
      'SELECT id FROM products WHERE id = $1',
      [product_id]
    );

    if (productCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Sản phẩm không tồn tại',
      });
    }

    // Check if already in wishlist
    const existingCheck = await pool.query(
      'SELECT id FROM wishlist WHERE user_id = $1 AND product_id = $2',
      [userId, product_id]
    );

    if (existingCheck.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Sản phẩm đã có trong danh sách yêu thích',
      });
    }

    const result = await pool.query(
      `INSERT INTO wishlist (user_id, product_id)
       VALUES ($1, $2)
       RETURNING *`,
      [userId, product_id]
    );

    res.status(201).json({
      success: true,
      message: 'Đã thêm vào danh sách yêu thích',
      data: result.rows[0],
    });
  } catch (error: any) {
    if (error.code === '23505') {
      // Unique constraint violation
      return res.status(400).json({
        success: false,
        message: 'Sản phẩm đã có trong danh sách yêu thích',
      });
    }
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Remove product from wishlist
export const removeFromWishlist = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { product_id } = req.params;

    const result = await pool.query(
      'DELETE FROM wishlist WHERE user_id = $1 AND product_id = $2 RETURNING id',
      [userId, product_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Sản phẩm không có trong danh sách yêu thích',
      });
    }

    res.json({
      success: true,
      message: 'Đã xóa khỏi danh sách yêu thích',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Check if product is in wishlist
export const checkWishlist = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { product_id } = req.params;

    const result = await pool.query(
      'SELECT id FROM wishlist WHERE user_id = $1 AND product_id = $2',
      [userId, product_id]
    );

    res.json({
      success: true,
      isInWishlist: result.rows.length > 0,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

