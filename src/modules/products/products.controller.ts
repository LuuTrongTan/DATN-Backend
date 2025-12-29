import { Response } from 'express';
import { AuthRequest } from '../../types/request.types';
import { pool } from '../../connections';
import { productSchema } from './products.validation';
import { ResponseHandler } from '../../utils/response';
import { logger } from '../../utils/logging';
import { uploadFile, uploadMultipleFiles } from '../upload/storage.service';

// UC-07: Tìm kiếm và lọc sản phẩm
export const searchProducts = async (req: AuthRequest, res: Response) => {
  try {
    const { q, category_id, category_slug, min_price, max_price, page = 1, limit = 20 } = req.query;
    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 20;
    const userId = req.user?.id || null;

    const baseQuery =
      'FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.is_active = TRUE AND p.deleted_at IS NULL';

    const selectClause =
      'SELECT p.*, c.name as category_name, ' +
      // Mảng tất cả ảnh (type = image)
      '(SELECT COALESCE(array_agg(pm.image_url ORDER BY pm.display_order, pm.id),' +
      " ARRAY[]::text[]) FROM product_media pm WHERE pm.product_id = p.id AND pm.type = 'image') AS image_urls, " +
      // Video đầu tiên (type = video)
      "(SELECT pm.image_url FROM product_media pm WHERE pm.product_id = p.id AND pm.type = 'video' ORDER BY pm.display_order, pm.id LIMIT 1) AS video_url, " +
      // Flag trong wishlist
      'CASE WHEN $1::uuid IS NULL THEN false ELSE EXISTS (SELECT 1 FROM wishlist w WHERE w.user_id = $1::uuid AND w.product_id = p.id) END as is_in_wishlist ';

    let query = selectClause + baseQuery;

    const params: any[] = [userId];
    let paramCount = 1;

    if (q) {
      paramCount++;
      // Full-text search using PostgreSQL tsvector (if available) or ILIKE
      // For better performance, you can create a tsvector column and GIN index
      query += ` AND (
        p.name ILIKE $${paramCount} 
        OR p.description ILIKE $${paramCount}
        OR p.name % $${paramCount}
        OR to_tsvector('simple', COALESCE(p.name, '') || ' ' || COALESCE(p.description, '')) @@ plainto_tsquery('simple', $${paramCount})
      )`;
      params.push(`%${q}%`);
    }

    if (category_id) {
      paramCount++;
      query += ` AND p.category_id = $${paramCount}`;
      params.push(category_id);
    } else if (category_slug) {
      // Map category_slug -> id (chỉ lấy category chưa xóa)
      const slugResult = await pool.query(
        'SELECT id FROM categories WHERE slug = $1 AND deleted_at IS NULL',
        [category_slug]
      );
      if (slugResult.rows.length > 0) {
        paramCount++;
        query += ` AND p.category_id = $${paramCount}`;
        params.push(slugResult.rows[0].id);
      }
    }

    if (min_price) {
      paramCount++;
      query += ` AND p.price >= $${paramCount}`;
      params.push(min_price);
    }

    if (max_price) {
      paramCount++;
      query += ` AND p.price <= $${paramCount}`;
      params.push(max_price);
    }

    // Count total
    const countQuery = query.replace(selectClause, 'SELECT COUNT(*) ');
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);

    // Add pagination
    paramCount++;
    query += ` ORDER BY p.created_at DESC LIMIT $${paramCount}`;
    params.push(limitNum);

    paramCount++;
    query += ` OFFSET $${paramCount}`;
    params.push((pageNum - 1) * limitNum);

    const result = await pool.query(query, params);

    return ResponseHandler.success(res, {
      data: result.rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error: any) {
    return ResponseHandler.internalError(res, error.message || 'Lỗi tìm kiếm sản phẩm');
  }
};

// Get all products
export const getProducts = async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 20;
    const userId = req.user?.id || null;

    const result = await pool.query(
      `SELECT p.*,
              c.name as category_name,
              -- Tất cả ảnh
              (SELECT COALESCE(array_agg(pm.image_url ORDER BY pm.display_order, pm.id), ARRAY[]::text[])
               FROM product_media pm
               WHERE pm.product_id = p.id AND pm.type = 'image') AS image_urls,
              -- Video đầu tiên
              (SELECT pm.image_url
               FROM product_media pm
               WHERE pm.product_id = p.id AND pm.type = 'video'
               ORDER BY pm.display_order, pm.id
               LIMIT 1) AS video_url,
              CASE WHEN $3::uuid IS NULL THEN false
                   ELSE EXISTS (
                     SELECT 1 FROM wishlist w
                     WHERE w.user_id = $3::uuid AND w.product_id = p.id
                   )
              END as is_in_wishlist
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.is_active = TRUE AND p.deleted_at IS NULL
       ORDER BY p.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limitNum, (pageNum - 1) * limitNum, userId]
    );

    const countResult = await pool.query(
      'SELECT COUNT(*) FROM products WHERE is_active = TRUE AND deleted_at IS NULL'
    );
    const total = parseInt(countResult.rows[0].count);

    return ResponseHandler.success(res, {
      data: result.rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error: any) {
    return ResponseHandler.internalError(res, error.message || 'Lỗi lấy danh sách sản phẩm');
  }
};

// Get all categories (public)
export const getCategories = async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT id, name, slug, image_url, description, is_active, created_at, updated_at, display_order
       FROM categories
       WHERE is_active = TRUE AND deleted_at IS NULL
       ORDER BY display_order NULLS LAST, name ASC`
    );

    return ResponseHandler.success(res, result.rows, 'Lấy danh sách danh mục thành công');
  } catch (error: any) {
    logger.error('Error fetching categories', error instanceof Error ? error : new Error(String(error)));
    return ResponseHandler.internalError(res, 'Lỗi khi lấy danh sách danh mục', error);
  }
};

// Get category by ID (public)
export const getCategoryById = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  try {

    const result = await pool.query(
      'SELECT id, name, slug, image_url, description, is_active, created_at, updated_at FROM categories WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );

    if (result.rows.length === 0) {
      return ResponseHandler.notFound(res, 'Danh mục không tồn tại');
    }

    return ResponseHandler.success(res, result.rows[0], 'Lấy thông tin danh mục thành công');
  } catch (error: any) {
    logger.error('Error fetching category', error instanceof Error ? error : new Error(String(error)), { categoryId: id });
    return ResponseHandler.internalError(res, 'Lỗi khi lấy thông tin danh mục', error);
  }
};

// Get product by ID
export const getProductById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id || null;

    const result = await pool.query(
      `SELECT p.*,
       c.name as category_name,
       -- Tất cả ảnh
       (SELECT COALESCE(array_agg(pm.image_url ORDER BY pm.display_order, pm.id), ARRAY[]::text[])
        FROM product_media pm
        WHERE pm.product_id = p.id AND pm.type = 'image') AS image_urls,
       -- Video đầu tiên
       (SELECT pm.image_url
        FROM product_media pm
        WHERE pm.product_id = p.id AND pm.type = 'video'
        ORDER BY pm.display_order, pm.id
        LIMIT 1) AS video_url,
       CASE WHEN $2::uuid IS NULL THEN false
            ELSE EXISTS (
              SELECT 1 FROM wishlist w
              WHERE w.user_id = $2::uuid AND w.product_id = p.id
            )
       END as is_in_wishlist,
       (SELECT json_agg(json_build_object(
         'id', pv.id,
         'sku', pv.sku,
         'variant_attributes', pv.variant_attributes,
         'price_adjustment', pv.price_adjustment,
         'stock_quantity', pv.stock_quantity,
         'image_url', pv.image_url,
         'is_active', pv.is_active
       )) FROM product_variants pv WHERE pv.product_id = p.id AND pv.deleted_at IS NULL) as variants
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.id = $1 AND p.deleted_at IS NULL`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return ResponseHandler.notFound(res, 'Sản phẩm không tồn tại');
    }

    return ResponseHandler.success(res, result.rows[0]);
  } catch (error: any) {
    return ResponseHandler.internalError(res, error.message || 'Lỗi lấy chi tiết sản phẩm');
  }
};

// UC-15: Thêm sản phẩm
export const createProduct = async (req: AuthRequest, res: Response) => {
  let category_id: number | undefined;
  let name: string | undefined;
  try {
    // Parse form data
    const body = req.body;
    category_id = parseInt(body.category_id);
    name = body.name;
    const description = body.description || null;
    const price = parseFloat(body.price);
    const stock_quantity = parseInt(body.stock_quantity);
    
    // Get video URL from form (if provided as URL)
    let videoUrl = body.video_url || null;
    
    // Handle file uploads
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    
    // Upload video file theo storage config
    if (files?.video_file && files.video_file.length > 0) {
      
      const videoFile = files.video_file[0];
      
      // Upload theo config (cloudflare, local, hoặc both)
      const uploadResult = await uploadFile(
        videoFile.buffer,
        videoFile.originalname,
        videoFile.mimetype
      );
      
      videoUrl = uploadResult.url;
    }
    
    // Validate required fields
    const sku = body.sku || `SKU-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    if (!category_id || !name || !sku || price === undefined || stock_quantity === undefined) {
      return ResponseHandler.error(res, 'Thiếu thông tin bắt buộc (category_id, name, sku, price, stock_quantity)', 400);
    }
    
    // Check if category exists
    const categoryCheck = await pool.query(
      'SELECT id FROM categories WHERE id = $1 AND deleted_at IS NULL',
      [category_id]
    );

    if (categoryCheck.rows.length === 0) {
      return ResponseHandler.notFound(res, 'Danh mục không tồn tại');
    }

    // Check if SKU already exists
    const skuCheck = await pool.query(
      'SELECT id FROM products WHERE sku = $1 AND deleted_at IS NULL',
      [sku]
    );

    if (skuCheck.rows.length > 0) {
      return ResponseHandler.conflict(res, 'SKU đã tồn tại');
    }

    // Insert product into database with all required fields
    const result = await pool.query(
      `INSERT INTO products (category_id, sku, name, description, price, stock_quantity, brand, view_count, sold_count, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, category_id, sku, name, description, price, stock_quantity, brand, view_count, sold_count, is_active, created_at, updated_at`,
      [
        category_id,
        sku,
        name,
        description,
        price,
        stock_quantity,
        body.brand || null,
        0, // view_count
        0, // sold_count
        body.is_active !== false, // default true
      ]
    );

    const product = result.rows[0];

    // Nếu có videoUrl, lưu vào product_media với type = 'video'
    if (videoUrl) {
      await pool.query(
        `INSERT INTO product_media (product_id, type, image_url, display_order, is_primary)
         VALUES ($1, 'video', $2, 0, FALSE)`,
        [product.id, videoUrl]
    );
    }

    return ResponseHandler.created(res, product, 'Thêm sản phẩm thành công');
  } catch (error: any) {
    logger.error('Create product error', error instanceof Error ? error : new Error(String(error)), {
      categoryId: category_id,
      name,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, error.message || 'Có lỗi xảy ra khi tạo sản phẩm', error);
  }
};

// UC-16: Sửa sản phẩm
export const updateProduct = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  try {
    const updates = req.body;


    // Check if product exists and not deleted
    const productCheck = await pool.query(
      'SELECT id, sku FROM products WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );

    if (productCheck.rows.length === 0) {
      return ResponseHandler.notFound(res, 'Sản phẩm không tồn tại');
    }

    // If SKU is being updated, check for duplicates
    if (updates.sku && updates.sku !== productCheck.rows[0].sku) {
      const skuCheck = await pool.query(
        'SELECT id FROM products WHERE sku = $1 AND id != $2 AND deleted_at IS NULL',
        [updates.sku, id]
      );
      if (skuCheck.rows.length > 0) {
        return ResponseHandler.conflict(res, 'SKU đã tồn tại');
      }
    }

    // If category_id is being updated, ensure category exists and not deleted
    if (updates.category_id !== undefined && updates.category_id !== null) {
      const categoryCheck = await pool.query(
        'SELECT id FROM categories WHERE id = $1 AND deleted_at IS NULL',
        [updates.category_id]
      );
      if (categoryCheck.rows.length === 0) {
        return ResponseHandler.notFound(res, 'Danh mục không tồn tại');
      }
    }

    const allowedFields = ['name', 'description', 'price', 'stock_quantity', 'category_id', 'sku', 'brand', 'is_active'];
    const updateFields: string[] = [];
    const values: any[] = [];
    let paramCount = 0;

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        paramCount++;
        updateFields.push(`${field} = $${paramCount}`);
        values.push(updates[field]);
      }
    }

    if (updateFields.length === 0) {
      return ResponseHandler.error(res, 'Không có trường nào để cập nhật', 400);
    }

    paramCount++;
    updateFields.push(`updated_at = NOW()`);
    paramCount++;
    values.push(id);

    const result = await pool.query(
      `UPDATE products SET ${updateFields.join(', ')} WHERE id = $${paramCount} AND deleted_at IS NULL
       RETURNING id, category_id, sku, name, description, price, stock_quantity, brand, view_count, sold_count, is_active, created_at, updated_at`,
      values
    );

    return ResponseHandler.success(res, result.rows[0], 'Cập nhật sản phẩm thành công');
  } catch (error: any) {
    logger.error('Error updating product', error instanceof Error ? error : new Error(String(error)), {
      productId: id,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi cập nhật sản phẩm', error);
  }
};

// UC-17: Xóa sản phẩm
export const deleteProduct = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  try {

    const result = await pool.query(
      `UPDATE products 
       SET deleted_at = NOW(), is_active = FALSE, updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id`,
      [id]
    );

    if (result.rows.length === 0) {
      return ResponseHandler.notFound(res, 'Sản phẩm không tồn tại');
    }

    // Soft delete toàn bộ biến thể liên quan
    await pool.query(
      `UPDATE product_variants 
       SET deleted_at = NOW(), is_active = FALSE, updated_at = NOW()
       WHERE product_id = $1 AND deleted_at IS NULL`,
      [id]
    );

    // Soft delete toàn bộ định nghĩa thuộc tính liên quan
    await pool.query(
      `DELETE FROM variant_attribute_values 
       WHERE definition_id IN (SELECT id FROM variant_attribute_definitions WHERE product_id = $1)`,
      [id]
    );
    
    await pool.query(
      `DELETE FROM variant_attribute_definitions WHERE product_id = $1`,
      [id]
    );

    return ResponseHandler.success(res, null, 'Xóa sản phẩm thành công');
  } catch (error: any) {
    logger.error('Error deleting product', error instanceof Error ? error : new Error(String(error)), {
      productId: id,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi xóa sản phẩm', error);
  }
};

