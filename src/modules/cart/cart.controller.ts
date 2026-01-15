import { Response } from 'express';
import { AuthRequest } from '../../types/request.types';
import { pool } from '../../connections';
import { cartItemSchema } from './cart.validation';
import { ResponseHandler } from '../../utils/response';
import { logger } from '../../utils/logging';

// UC-08: Thêm sản phẩm vào giỏ hàng
export const addToCart = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  let product_id: number | undefined;
  let variant_id: number | undefined;
  let quantity: number | undefined;
  try {
    if (!userId) {
      return ResponseHandler.error(res, 'Người dùng chưa đăng nhập', 401);
    }
    const validated = cartItemSchema.parse(req.body);
    product_id = validated.product_id;
    variant_id = validated.variant_id ?? undefined;
    quantity = validated.quantity;

    // Check product stock (with soft delete + active check)
    let stockQuery = 'SELECT stock_quantity FROM products WHERE id = $1 AND deleted_at IS NULL AND is_active = TRUE';
    if (variant_id) {
      stockQuery =
        'SELECT pv.stock_quantity FROM product_variants pv JOIN products p ON pv.product_id = p.id ' +
        'WHERE pv.id = $1 AND pv.deleted_at IS NULL AND pv.is_active = TRUE ' +
        'AND p.deleted_at IS NULL AND p.is_active = TRUE';
    }

    const stockResult = await pool.query(stockQuery, [variant_id || product_id]);
    
    if (stockResult.rows.length === 0) {
      return ResponseHandler.notFound(res, 'Sản phẩm không tồn tại hoặc đã bị xóa/vô hiệu');
    }

    const rawStock = stockResult.rows[0].stock_quantity;
    if (rawStock === null || rawStock === undefined) {
      return ResponseHandler.error(res, 'Không xác định được tồn kho sản phẩm', 400, {
        code: 'STOCK_NOT_AVAILABLE',
      });
    }

    const availableStock = parseInt(rawStock);

    // Check existing cart item
    const existingItem = await pool.query(
      'SELECT id, quantity FROM cart_items WHERE user_id = $1 AND product_id = $2 AND variant_id = $3',
      [userId, product_id, variant_id || null]
    );

    if (existingItem.rows.length > 0) {
      const newQuantity = existingItem.rows[0].quantity + quantity;
      
      if (newQuantity > availableStock) {
        return ResponseHandler.error(res, 'Số lượng sản phẩm không đủ', 400, {
          code: 'INSUFFICIENT_STOCK',
          details: { available: availableStock, requested: newQuantity },
        });
      }

      await pool.query(
        'UPDATE cart_items SET quantity = $1, updated_at = NOW() WHERE id = $2',
        [newQuantity, existingItem.rows[0].id]
      );
    } else {
      if (quantity > availableStock) {
        return ResponseHandler.error(res, 'Số lượng sản phẩm không đủ', 400, {
          code: 'INSUFFICIENT_STOCK',
          details: { available: availableStock, requested: quantity },
        });
      }

      await pool.query(
        `INSERT INTO cart_items (user_id, product_id, variant_id, quantity)
         VALUES ($1, $2, $3, $4)`,
        [userId, product_id, variant_id || null, quantity]
      );
    }

    return ResponseHandler.success(res, null, 'Thêm vào giỏ hàng thành công');
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return ResponseHandler.validationError(res, error.errors);
    }
    logger.error('Error adding to cart', error instanceof Error ? error : new Error(String(error)), {
      userId,
      productId: product_id,
      variantId: variant_id,
      quantity,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi thêm vào giỏ hàng', error);
  }
};

// UC-09: Lấy sản phẩm trong giỏ hàng
export const getCart = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const result = await pool.query(
      `SELECT 
        ci.id,
        ci.user_id,
        ci.product_id,
        ci.variant_id,
        ci.quantity,
        ci.created_at,
        ci.updated_at,
        p.id as product_db_id,
        p.name,
        p.price,
        p.stock_quantity as product_stock,
        pm.image_url as product_image_url,
        pv.id as variant_db_id,
        pv.sku as variant_sku,
        pv.variant_attributes,
        pv.price_adjustment,
        pv.stock_quantity as variant_stock,
        pv.image_url as variant_image_url
       FROM cart_items ci
       JOIN products p ON ci.product_id = p.id AND p.deleted_at IS NULL AND p.is_active = TRUE
       LEFT JOIN LATERAL (
         SELECT image_url
         FROM product_media
         WHERE product_id = p.id AND type = 'image'
         ORDER BY is_primary DESC, display_order, id
         LIMIT 1
       ) pm ON TRUE
       LEFT JOIN product_variants pv ON ci.variant_id = pv.id AND pv.deleted_at IS NULL AND pv.is_active = TRUE
       WHERE ci.user_id = $1
       ORDER BY ci.created_at DESC`,
      [userId]
    );

    // Format response with proper structure
    const items = result.rows.map(item => {
      const availableStock = item.variant_id ? item.variant_stock : item.product_stock;
      const isAvailable = item.quantity <= availableStock;
      
      return {
        id: item.id,
        user_id: item.user_id,
        product_id: item.product_id,
        variant_id: item.variant_id,
        quantity: item.quantity,
        created_at: item.created_at,
        updated_at: item.updated_at,
        product: {
          id: item.product_db_id,
          name: item.name,
          price: parseFloat(item.price),
          stock_quantity: item.product_stock,
          image_url: item.product_image_url,
        },
        variant: item.variant_id ? {
          id: item.variant_db_id,
          product_id: item.product_id,
          sku: item.variant_sku,
          variant_attributes: typeof item.variant_attributes === 'string' 
            ? JSON.parse(item.variant_attributes) 
            : item.variant_attributes || {},
          price_adjustment: parseFloat(item.price_adjustment || 0),
          stock_quantity: item.variant_stock,
          image_url: item.variant_image_url,
        } : null,
        is_available: isAvailable,
        available_stock: availableStock,
      };
    });

    return ResponseHandler.success(res, items, 'Lấy giỏ hàng thành công');
  } catch (error: any) {
    logger.error('Error fetching cart', error instanceof Error ? error : new Error(String(error)), {
      userId: req.user?.id,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi lấy giỏ hàng', error);
  }
};

// UC-10: Xóa sản phẩm khỏi giỏ hàng
export const removeFromCart = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.user?.id;
  try {
    if (!userId) {
      return ResponseHandler.error(res, 'Người dùng chưa đăng nhập', 401);
    }

    const result = await pool.query(
      'DELETE FROM cart_items WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return ResponseHandler.notFound(res, 'Sản phẩm không tồn tại trong giỏ hàng');
    }

    return ResponseHandler.success(res, null, 'Xóa sản phẩm khỏi giỏ hàng thành công');
  } catch (error: any) {
    logger.error('Error removing from cart', error instanceof Error ? error : new Error(String(error)), {
      userId,
      cartItemId: id,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi xóa sản phẩm khỏi giỏ hàng', error);
  }
};

// UC-11: Sửa sản phẩm trong giỏ hàng
export const updateCartItem = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { quantity } = req.body;
  const userId = req.user?.id;
  try {
    if (!userId) {
      return ResponseHandler.error(res, 'Người dùng chưa đăng nhập', 401);
    }

    if (!quantity || quantity < 1) {
      return ResponseHandler.error(res, 'Số lượng phải lớn hơn 0', 400);
    }

    // Get cart item with product info (not deleted, active)
    const cartItem = await pool.query(
      `SELECT ci.*, p.stock_quantity as product_stock, pv.stock_quantity as variant_stock
       FROM cart_items ci
       JOIN products p ON ci.product_id = p.id AND p.deleted_at IS NULL AND p.is_active = TRUE
       LEFT JOIN product_variants pv ON ci.variant_id = pv.id AND pv.deleted_at IS NULL AND pv.is_active = TRUE
       WHERE ci.id = $1 AND ci.user_id = $2`,
      [id, userId]
    );

    if (cartItem.rows.length === 0) {
      return ResponseHandler.notFound(res, 'Sản phẩm không tồn tại trong giỏ hàng');
    }

    const item = cartItem.rows[0];
    const availableStock = item.variant_id ? item.variant_stock : item.product_stock;

    if (quantity > availableStock) {
      return ResponseHandler.error(res, 'Hàng tồn kho không đủ', 400, {
        code: 'INSUFFICIENT_STOCK',
        details: { available: availableStock, requested: quantity },
      });
    }

    await pool.query(
      'UPDATE cart_items SET quantity = $1, updated_at = NOW() WHERE id = $2',
      [quantity, id]
    );

    return ResponseHandler.success(res, null, 'Cập nhật giỏ hàng thành công');
  } catch (error: any) {
    logger.error('Error updating cart item', error instanceof Error ? error : new Error(String(error)), {
      userId,
      cartItemId: id,
      quantity,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi cập nhật giỏ hàng', error);
  }
};

