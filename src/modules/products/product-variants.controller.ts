import { Response } from 'express';
import { AuthRequest } from '../../types/request.types';
import { pool } from '../../connections';
import { createVariantSchema, updateVariantSchema } from './product-variants.validation';
import { ResponseHandler } from '../../utils/response';
import { logger } from '../../utils/logging';

// Tạo biến thể sản phẩm
export const createVariant = async (req: AuthRequest, res: Response) => {
  const { product_id } = req.params;
  try {
    const validated = createVariantSchema.parse(req.body);

    // Kiểm tra sản phẩm tồn tại
    const productCheck = await pool.query(
      'SELECT id FROM products WHERE id = $1',
      [product_id]
    );

    if (productCheck.rows.length === 0) {
      return ResponseHandler.notFound(res, 'Sản phẩm không tồn tại');
    }

    // Kiểm tra variant đã tồn tại chưa (cùng product_id, variant_type, variant_value)
    const existingCheck = await pool.query(
      `SELECT id FROM product_variants 
       WHERE product_id = $1 AND variant_type = $2 AND variant_value = $3`,
      [product_id, validated.variant_type, validated.variant_value]
    );

    if (existingCheck.rows.length > 0) {
      return ResponseHandler.badRequest(
        res,
        'Biến thể này đã tồn tại cho sản phẩm này'
      );
    }

    const result = await pool.query(
      `INSERT INTO product_variants (product_id, variant_type, variant_value, price_adjustment, stock_quantity)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, product_id, variant_type, variant_value, price_adjustment, stock_quantity, created_at, updated_at`,
      [
        product_id,
        validated.variant_type,
        validated.variant_value,
        validated.price_adjustment || 0,
        validated.stock_quantity || 0,
      ]
    );

    return ResponseHandler.success(res, {
      message: 'Tạo biến thể thành công',
      data: result.rows[0],
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return ResponseHandler.badRequest(res, 'Dữ liệu không hợp lệ', error.errors);
    }
    logger.error('Error creating variant', error instanceof Error ? error : new Error(String(error)), {
      productId: product_id,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi tạo biến thể', error);
  }
};

// Lấy tất cả biến thể của sản phẩm
export const getVariantsByProduct = async (req: AuthRequest, res: Response) => {
  const { product_id } = req.params;
  try {

    const result = await pool.query(
      `SELECT id, product_id, variant_type, variant_value, price_adjustment, stock_quantity, created_at, updated_at FROM product_variants 
       WHERE product_id = $1 
       ORDER BY variant_type, variant_value`,
      [product_id]
    );

    return ResponseHandler.success(res, result.rows);
  } catch (error: any) {
    logger.error('Error fetching variants', error instanceof Error ? error : new Error(String(error)), {
      productId: product_id,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi lấy danh sách biến thể', error);
  }
};

// Lấy biến thể theo ID
export const getVariantById = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  try {

    const result = await pool.query(
      'SELECT id, product_id, variant_type, variant_value, price_adjustment, stock_quantity, created_at, updated_at FROM product_variants WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return ResponseHandler.notFound(res, 'Biến thể không tồn tại');
    }

    return ResponseHandler.success(res, result.rows[0]);
  } catch (error: any) {
    logger.error('Error fetching variant', error instanceof Error ? error : new Error(String(error)), {
      variantId: id,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi lấy thông tin biến thể', error);
  }
};

// Cập nhật biến thể
export const updateVariant = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  try {
    const validated = updateVariantSchema.parse(req.body);

    // Kiểm tra variant tồn tại
    const variantCheck = await pool.query(
      'SELECT id, product_id FROM product_variants WHERE id = $1',
      [id]
    );

    if (variantCheck.rows.length === 0) {
      return ResponseHandler.notFound(res, 'Biến thể không tồn tại');
    }

    const productId = variantCheck.rows[0].product_id;

    // Nếu thay đổi variant_type hoặc variant_value, kiểm tra trùng lặp
    if (validated.variant_type || validated.variant_value) {
      const currentVariant = await pool.query(
        'SELECT variant_type, variant_value FROM product_variants WHERE id = $1',
        [id]
      );

      const newType = validated.variant_type || currentVariant.rows[0].variant_type;
      const newValue = validated.variant_value || currentVariant.rows[0].variant_value;

      const existingCheck = await pool.query(
        `SELECT id FROM product_variants 
         WHERE product_id = $1 AND variant_type = $2 AND variant_value = $3 AND id != $4`,
        [productId, newType, newValue, id]
      );

      if (existingCheck.rows.length > 0) {
        return ResponseHandler.badRequest(
          res,
          'Biến thể này đã tồn tại cho sản phẩm này'
        );
      }
    }

    // Build update query
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 0;

    if (validated.variant_type !== undefined) {
      paramCount++;
      updates.push(`variant_type = $${paramCount}`);
      values.push(validated.variant_type);
    }

    if (validated.variant_value !== undefined) {
      paramCount++;
      updates.push(`variant_value = $${paramCount}`);
      values.push(validated.variant_value);
    }

    if (validated.price_adjustment !== undefined) {
      paramCount++;
      updates.push(`price_adjustment = $${paramCount}`);
      values.push(validated.price_adjustment);
    }

    if (validated.stock_quantity !== undefined) {
      paramCount++;
      updates.push(`stock_quantity = $${paramCount}`);
      values.push(validated.stock_quantity);
    }

    if (updates.length === 0) {
      return ResponseHandler.badRequest(res, 'Không có trường nào để cập nhật');
    }

    paramCount++;
    values.push(id);

    const result = await pool.query(
      `UPDATE product_variants SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING id, product_id, variant_type, variant_value, price_adjustment, stock_quantity, created_at, updated_at`,
      values
    );

    return ResponseHandler.success(res, {
      message: 'Cập nhật biến thể thành công',
      data: result.rows[0],
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return ResponseHandler.badRequest(res, 'Dữ liệu không hợp lệ', error.errors);
    }
    logger.error('Error updating variant', error instanceof Error ? error : new Error(String(error)), {
      variantId: id,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi cập nhật biến thể', error);
  }
};

// Xóa biến thể
export const deleteVariant = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  try {

    // Kiểm tra variant có đang được sử dụng trong giỏ hàng hoặc đơn hàng không
    const cartCheck = await pool.query(
      'SELECT COUNT(*) FROM cart_items WHERE variant_id = $1',
      [id]
    );

    const orderCheck = await pool.query(
      'SELECT COUNT(*) FROM order_items WHERE variant_id = $1',
      [id]
    );

    if (parseInt(cartCheck.rows[0].count) > 0 || parseInt(orderCheck.rows[0].count) > 0) {
      return ResponseHandler.badRequest(
        res,
        'Không thể xóa biến thể đang được sử dụng trong giỏ hàng hoặc đơn hàng'
      );
    }

    const result = await pool.query(
      `UPDATE product_variants 
       SET deleted_at = NOW(), is_active = FALSE, updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id`,
      [id]
    );

    if (result.rows.length === 0) {
      return ResponseHandler.notFound(res, 'Biến thể không tồn tại');
    }

    return ResponseHandler.success(res, {
      message: 'Xóa (ẩn) biến thể thành công',
    });
  } catch (error: any) {
    logger.error('Error deleting variant', error instanceof Error ? error : new Error(String(error)), {
      variantId: id,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi xóa biến thể', error);
  }
};

