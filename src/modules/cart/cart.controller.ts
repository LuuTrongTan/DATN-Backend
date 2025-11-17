import { Response } from 'express';
import { AuthRequest } from '../../middlewares/auth.middleware';
import { pool } from '../../connections';
import { cartItemSchema } from '../../utils/validation';

// UC-08: Thêm sản phẩm vào giỏ hàng
export const addToCart = async (req: AuthRequest, res: Response) => {
  try {
    const validated = cartItemSchema.parse(req.body);
    const { product_id, variant_id, quantity } = validated;
    const userId = req.user!.id;

    // Check product stock
    let stockQuery = 'SELECT stock_quantity FROM products WHERE id = $1';
    if (variant_id) {
      stockQuery = 'SELECT stock_quantity FROM product_variants WHERE id = $1';
    }

    const stockResult = await pool.query(stockQuery, [variant_id || product_id]);
    
    if (stockResult.rows.length === 0) {
      return res.status(404).json({ message: 'Sản phẩm không tồn tại' });
    }

    const availableStock = parseInt(stockResult.rows[0].stock_quantity);

    // Check existing cart item
    const existingItem = await pool.query(
      'SELECT id, quantity FROM cart_items WHERE user_id = $1 AND product_id = $2 AND variant_id = $3',
      [userId, product_id, variant_id || null]
    );

    if (existingItem.rows.length > 0) {
      const newQuantity = existingItem.rows[0].quantity + quantity;
      
      if (newQuantity > availableStock) {
        return res.status(400).json({ 
          message: 'Số lượng sản phẩm không đủ',
          available: availableStock 
        });
      }

      await pool.query(
        'UPDATE cart_items SET quantity = $1, updated_at = NOW() WHERE id = $2',
        [newQuantity, existingItem.rows[0].id]
      );
    } else {
      if (quantity > availableStock) {
        return res.status(400).json({ 
          message: 'Số lượng sản phẩm không đủ',
          available: availableStock 
        });
      }

      await pool.query(
        `INSERT INTO cart_items (user_id, product_id, variant_id, quantity)
         VALUES ($1, $2, $3, $4)`,
        [userId, product_id, variant_id || null, quantity]
      );
    }

    res.json({ message: 'Thêm vào giỏ hàng thành công' });
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

// UC-09: Lấy sản phẩm trong giỏ hàng
export const getCart = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const result = await pool.query(
      `SELECT 
        ci.id,
        ci.product_id,
        ci.variant_id,
        ci.quantity,
        p.name,
        p.price,
        p.image_urls,
        pv.variant_type,
        pv.variant_value,
        pv.price_adjustment,
        pv.stock_quantity as variant_stock,
        p.stock_quantity as product_stock
       FROM cart_items ci
       JOIN products p ON ci.product_id = p.id
       LEFT JOIN product_variants pv ON ci.variant_id = pv.id
       WHERE ci.user_id = $1
       ORDER BY ci.created_at DESC`,
      [userId]
    );

    // Check stock availability
    const items = result.rows.map(item => {
      const availableStock = item.variant_id ? item.variant_stock : item.product_stock;
      const isAvailable = item.quantity <= availableStock;
      
      return {
        ...item,
        is_available: isAvailable,
        available_stock: availableStock,
      };
    });

    res.json({ items });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// UC-10: Xóa sản phẩm khỏi giỏ hàng
export const removeFromCart = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const result = await pool.query(
      'DELETE FROM cart_items WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Sản phẩm không tồn tại trong giỏ hàng' });
    }

    res.json({ message: 'Xóa sản phẩm khỏi giỏ hàng thành công' });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// UC-11: Sửa sản phẩm trong giỏ hàng
export const updateCartItem = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { quantity } = req.body;
    const userId = req.user!.id;

    if (!quantity || quantity < 1) {
      return res.status(400).json({ message: 'Số lượng phải lớn hơn 0' });
    }

    // Get cart item with product info
    const cartItem = await pool.query(
      `SELECT ci.*, p.stock_quantity as product_stock, pv.stock_quantity as variant_stock
       FROM cart_items ci
       JOIN products p ON ci.product_id = p.id
       LEFT JOIN product_variants pv ON ci.variant_id = pv.id
       WHERE ci.id = $1 AND ci.user_id = $2`,
      [id, userId]
    );

    if (cartItem.rows.length === 0) {
      return res.status(404).json({ message: 'Sản phẩm không tồn tại trong giỏ hàng' });
    }

    const item = cartItem.rows[0];
    const availableStock = item.variant_id ? item.variant_stock : item.product_stock;

    if (quantity > availableStock) {
      return res.status(400).json({
        message: 'Hàng tồn kho không đủ',
        available: availableStock,
      });
    }

    await pool.query(
      'UPDATE cart_items SET quantity = $1, updated_at = NOW() WHERE id = $2',
      [quantity, id]
    );

    res.json({ message: 'Cập nhật giỏ hàng thành công' });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

