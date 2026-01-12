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
      'SELECT id FROM products WHERE id = $1 AND deleted_at IS NULL',
      [product_id]
    );

    if (productCheck.rows.length === 0) {
      return ResponseHandler.notFound(res, 'Sản phẩm không tồn tại');
    }

    // Đảm bảo variant_attributes không rỗng
    const attributeNames = Object.keys(validated.variant_attributes);
    if (attributeNames.length === 0) {
      return ResponseHandler.badRequest(res, 'Phải có ít nhất một thuộc tính biến thể');
    }

    // Kiểm tra variant đã tồn tại chưa (cùng product_id và variant_attributes)
    const existingCheck = await pool.query(
      `SELECT id FROM product_variants 
       WHERE product_id = $1 AND variant_attributes = $2::jsonb`,
      [product_id, JSON.stringify(validated.variant_attributes)]
    );

    if (existingCheck.rows.length > 0) {
      return ResponseHandler.badRequest(
        res,
        'Biến thể này đã tồn tại cho sản phẩm này'
      );
    }

    const result = await pool.query(
      `INSERT INTO product_variants (product_id, sku, variant_attributes, price_adjustment, stock_quantity, image_url, is_active)
       VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7)
       RETURNING id, product_id, sku, variant_attributes, price_adjustment, stock_quantity, image_url, is_active, created_at, updated_at`,
      [
        product_id,
        validated.sku || null,
        JSON.stringify(validated.variant_attributes),
        validated.price_adjustment || 0,
        validated.stock_quantity || 0,
        validated.image_url || null,
        validated.is_active !== false,
      ]
    );

    const variant = result.rows[0];

    // Xử lý variant images nếu có
    const variantImageUrls = Array.isArray(validated.image_urls) 
      ? validated.image_urls 
      : typeof validated.image_urls === 'string' 
        ? [validated.image_urls] 
        : [];

    if (variantImageUrls.length > 0) {
      try {
        for (let i = 0; i < variantImageUrls.length; i++) {
          await pool.query(
            `INSERT INTO product_media (product_id, variant_id, type, image_url, display_order, is_primary)
             VALUES ($1, $2, 'image', $3, $4, $5)`,
            [product_id, variant.id, variantImageUrls[i], i, i === 0] // Ảnh đầu tiên là primary
          );
        }
      } catch (imageError: any) {
        // Log lỗi chi tiết
        logger.error('Error inserting variant images', imageError instanceof Error ? imageError : new Error(String(imageError)), {
          productId: product_id,
          variantId: variant.id,
          imageUrls: variantImageUrls,
          errorMessage: imageError.message,
          errorCode: imageError.code,
        });
        
        // Nếu lỗi là do cột variant_id chưa tồn tại, throw error để user biết cần chạy migration
        if (imageError.message && (
          imageError.message.includes('variant_id') || 
          imageError.message.includes('column') ||
          imageError.code === '42703' // PostgreSQL error code for undefined column
        )) {
          throw new Error('Cột variant_id chưa tồn tại trong product_media. Vui lòng chạy migration: npm run migrate hoặc node dist/connections/db/migrate.js');
        }
        
        // Các lỗi khác: throw để user biết
        throw new Error(`Lỗi khi lưu hình ảnh biến thể: ${imageError.message || 'Unknown error'}`);
      }
    }

    // Query lại variant với images
    const variantWithImages = await pool.query(
      `SELECT pv.*,
              (SELECT COALESCE(array_agg(pm.image_url ORDER BY pm.display_order, pm.id), ARRAY[]::text[])
               FROM product_media pm
               WHERE pm.variant_id = pv.id AND pm.type = 'image') AS image_urls
       FROM product_variants pv
       WHERE pv.id = $1`,
      [variant.id]
    );

    return ResponseHandler.success(res, {
      message: 'Tạo biến thể thành công',
      data: variantWithImages.rows[0],
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return ResponseHandler.badRequest(res, 'Dữ liệu không hợp lệ', error.errors);
    }
    logger.error('Error creating variant', error instanceof Error ? error : new Error(String(error)), {
      productId: product_id,
      body: req.body,
      errorMessage: error.message,
      errorStack: error.stack,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, `Lỗi tạo biến thể: ${error.message || 'Unknown error'}`, error);
  }
};

// Lấy tất cả biến thể của sản phẩm
export const getVariantsByProduct = async (req: AuthRequest, res: Response) => {
  const { product_id } = req.params;
  try {
    const result = await pool.query(
      `SELECT pv.id, pv.product_id, pv.sku, pv.variant_attributes, pv.price_adjustment, pv.stock_quantity, pv.image_url, pv.is_active, pv.created_at, pv.updated_at,
              -- Lấy images của variant từ product_media
              (SELECT COALESCE(array_agg(pm.image_url ORDER BY pm.display_order, pm.id), ARRAY[]::text[])
               FROM product_media pm
               WHERE pm.variant_id = pv.id AND pm.type = 'image') AS image_urls
       FROM product_variants pv 
       WHERE pv.product_id = $1 AND pv.deleted_at IS NULL
       ORDER BY pv.variant_attributes`,
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
      `SELECT pv.id, pv.product_id, pv.sku, pv.variant_attributes, pv.price_adjustment, pv.stock_quantity, pv.image_url, pv.is_active, pv.created_at, pv.updated_at,
              -- Lấy images của variant từ product_media
              (SELECT COALESCE(array_agg(pm.image_url ORDER BY pm.display_order, pm.id), ARRAY[]::text[])
               FROM product_media pm
               WHERE pm.variant_id = pv.id AND pm.type = 'image') AS image_urls
       FROM product_variants pv 
       WHERE pv.id = $1 AND pv.deleted_at IS NULL`,
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
      'SELECT id, product_id, variant_attributes FROM product_variants WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );

    if (variantCheck.rows.length === 0) {
      return ResponseHandler.notFound(res, 'Biến thể không tồn tại');
    }

    const productId = variantCheck.rows[0].product_id;
    const currentAttributes = variantCheck.rows[0].variant_attributes;

    // Nếu thay đổi variant_attributes, kiểm tra trùng lặp và tự động tạo definitions/values
    if (validated.variant_attributes) {
      const newAttributes = validated.variant_attributes;
      const attributeNames = Object.keys(newAttributes);

      // Kiểm tra trùng lặp
      const existingCheck = await pool.query(
        `SELECT id FROM product_variants 
         WHERE product_id = $1 AND variant_attributes = $2::jsonb AND id != $3`,
        [productId, JSON.stringify(newAttributes), id]
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

    if (validated.sku !== undefined) {
      paramCount++;
      updates.push(`sku = $${paramCount}`);
      values.push(validated.sku);
    }

    if (validated.variant_attributes !== undefined) {
      paramCount++;
      updates.push(`variant_attributes = $${paramCount}::jsonb`);
      values.push(JSON.stringify(validated.variant_attributes));
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

    if (validated.image_url !== undefined) {
      paramCount++;
      updates.push(`image_url = $${paramCount}`);
      values.push(validated.image_url);
    }

    if (validated.is_active !== undefined) {
      paramCount++;
      updates.push(`is_active = $${paramCount}`);
      values.push(validated.is_active);
    }

    if (updates.length === 0) {
      return ResponseHandler.badRequest(res, 'Không có trường nào để cập nhật');
    }

    paramCount++;
    updates.push(`updated_at = NOW()`);
    paramCount++;
    values.push(id);

    const result = await pool.query(
      `UPDATE product_variants SET ${updates.join(', ')} 
       WHERE id = $${paramCount} AND deleted_at IS NULL
       RETURNING id, product_id, sku, variant_attributes, price_adjustment, stock_quantity, image_url, is_active, created_at, updated_at`,
      values
    );

    const variant = result.rows[0];

    // Xử lý cập nhật variant images nếu có image_urls trong body
    if (validated.image_urls !== undefined) {
      // Xóa tất cả images cũ của variant
      await pool.query(
        `DELETE FROM product_media WHERE variant_id = $1 AND type = 'image'`,
        [id]
      );

      // Thêm images mới
      const imageUrls = Array.isArray(validated.image_urls) 
        ? validated.image_urls 
        : typeof validated.image_urls === 'string' 
          ? [validated.image_urls] 
          : [];

      if (imageUrls.length > 0) {
        for (let i = 0; i < imageUrls.length; i++) {
          await pool.query(
            `INSERT INTO product_media (product_id, variant_id, type, image_url, display_order, is_primary)
             VALUES ($1, $2, 'image', $3, $4, $5)`,
            [variant.product_id, id, imageUrls[i], i, i === 0]
          );
        }
      }
    }

    // Query lại variant với images
    const variantWithImages = await pool.query(
      `SELECT pv.*,
              (SELECT COALESCE(array_agg(pm.image_url ORDER BY pm.display_order, pm.id), ARRAY[]::text[])
               FROM product_media pm
               WHERE pm.variant_id = pv.id AND pm.type = 'image') AS image_urls
       FROM product_variants pv
       WHERE pv.id = $1`,
      [id]
    );

    return ResponseHandler.success(res, {
      message: 'Cập nhật biến thể thành công',
      data: variantWithImages.rows[0],
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

