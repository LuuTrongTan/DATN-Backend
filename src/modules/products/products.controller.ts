import { Response } from 'express';
import { AuthRequest } from '../../types/request.types';
import { pool } from '../../connections';
import { productSchema } from './products.validation';
import { ResponseHandler } from '../../utils/response';
import { logger } from '../../utils/logging';
import { uploadFile, uploadMultipleFiles } from '../upload/storage.service';
import { syncProductTags, ensureTagExists } from './product-tags.controller';
import { checkAndSendLowStockAlert } from '../../utils/email.service';

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
      // Mảng tất cả ảnh của sản phẩm chính (không phải variant) - DISTINCT để tránh duplicate
      "(SELECT COALESCE(array_agg(pm.image_url ORDER BY pm.display_order, pm.id), ARRAY[]::text[]) " +
      "FROM (SELECT DISTINCT ON (pm.image_url) pm.image_url, pm.display_order, pm.id " +
      "FROM product_media pm WHERE pm.product_id = p.id AND pm.type = 'image' " +
      "ORDER BY pm.image_url, pm.display_order, pm.id) pm) AS image_urls, " +
      // Video đầu tiên của sản phẩm chính (không phải variant)
      "(SELECT pm.image_url FROM product_media pm WHERE pm.product_id = p.id AND pm.type = 'video' ORDER BY pm.display_order, pm.id LIMIT 1) AS video_url, " +
      // Tags của sản phẩm
      "(SELECT json_agg(json_build_object('id', pt.id, 'name', pt.name, 'slug', pt.slug)) " +
      "FROM product_tags pt INNER JOIN product_tag_relations ptr ON pt.id = ptr.tag_id " +
      "WHERE ptr.product_id = p.id) AS tags, " +
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

    // Filter by tags
    if (req.query.tag_ids) {
      const tagIds = Array.isArray(req.query.tag_ids) 
        ? req.query.tag_ids.map(id => parseInt(id as string))
        : [parseInt(req.query.tag_ids as string)];
      
      if (tagIds.length > 0) {
        paramCount++;
        query += ` AND EXISTS (
          SELECT 1 FROM product_tag_relations ptr 
          WHERE ptr.product_id = p.id AND ptr.tag_id = ANY($${paramCount}::int[])
        )`;
        params.push(tagIds);
      }
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
    const { page = 1, limit = 20, category_id, category_slug, search } = req.query;
    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 20;
    const userId = req.user?.id || null;

    // Build WHERE clause for filters (without userId)
    let whereClause = 'WHERE p.is_active = TRUE AND p.deleted_at IS NULL';
    const filterParams: any[] = [];
    let filterParamCount = 0;
    let categoryIdForFilter: number | null = null;

    // Handle category filter
    if (category_id) {
      filterParamCount++;
      whereClause += ` AND p.category_id = $${filterParamCount}`;
      filterParams.push(category_id);
      categoryIdForFilter = parseInt(category_id as string);
    } else if (category_slug) {
      // Map category_slug -> id (chỉ lấy category chưa xóa)
      const slugResult = await pool.query(
        'SELECT id FROM categories WHERE slug = $1 AND deleted_at IS NULL',
        [category_slug]
      );
      if (slugResult.rows.length > 0) {
        filterParamCount++;
        whereClause += ` AND p.category_id = $${filterParamCount}`;
        filterParams.push(slugResult.rows[0].id);
        categoryIdForFilter = slugResult.rows[0].id;
      } else {
        // Nếu không tìm thấy category với slug này, trả về empty result
        return ResponseHandler.success(res, {
          data: [],
          pagination: {
            page: pageNum,
            limit: limitNum,
            total: 0,
            totalPages: 0,
          },
        });
      }
    }

    // Handle search
    if (search) {
      filterParamCount++;
      whereClause += ` AND (
        p.name ILIKE $${filterParamCount} 
        OR p.description ILIKE $${filterParamCount}
        OR p.sku ILIKE $${filterParamCount}
      )`;
      filterParams.push(`%${search}%`);
    }

    // Build params for main query (includes userId, limit, offset)
    const queryParams = [...filterParams, userId, limitNum, (pageNum - 1) * limitNum];
    const userIdParamIndex = filterParamCount + 1;
    const limitParamIndex = filterParamCount + 2;
    const offsetParamIndex = filterParamCount + 3;

    const result = await pool.query(
      `SELECT p.*,
              c.name as category_name,
              -- Tất cả ảnh của sản phẩm chính (không phải variant) - DISTINCT để tránh duplicate
              (SELECT COALESCE(array_agg(pm.image_url ORDER BY pm.display_order, pm.id), ARRAY[]::text[])
               FROM (
                 SELECT DISTINCT ON (pm.image_url) pm.image_url, pm.display_order, pm.id
                 FROM product_media pm
                 WHERE pm.product_id = p.id AND pm.type = 'image'
                 ORDER BY pm.image_url, pm.display_order, pm.id
               ) pm) AS image_urls,
              -- Video đầu tiên của sản phẩm chính (không phải variant)
              (SELECT pm.image_url
               FROM product_media pm
               WHERE pm.product_id = p.id AND pm.type = 'video'
               ORDER BY pm.display_order, pm.id
               LIMIT 1) AS video_url,
              CASE WHEN $${userIdParamIndex}::uuid IS NULL THEN false
                   ELSE EXISTS (
                     SELECT 1 FROM wishlist w
                     WHERE w.user_id = $${userIdParamIndex}::uuid AND w.product_id = p.id
                   )
              END as is_in_wishlist
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       ${whereClause}
       ORDER BY p.created_at DESC
       LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex}`,
      queryParams
    );

    // Count total with same filters (no userId, limit, offset)
    const countQuery = `SELECT COUNT(*) FROM products p ${whereClause}`;
    const countResult = await pool.query(countQuery, filterParams);
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
    logger.error('Error fetching products', error instanceof Error ? error : new Error(String(error)));
    return ResponseHandler.internalError(res, error.message || 'Lỗi lấy danh sách sản phẩm', error);
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
       -- Tất cả ảnh của product (không phải variant images)
       (SELECT COALESCE(array_agg(pm.image_url ORDER BY pm.display_order, pm.id), ARRAY[]::text[])
        FROM product_media pm
        WHERE pm.product_id = p.id AND pm.type = 'image') AS image_urls,
       -- Video đầu tiên của product (không phải variant video)
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
         'id', pt.id,
         'name', pt.name,
         'slug', pt.slug
       )) FROM product_tags pt
        INNER JOIN product_tag_relations ptr ON pt.id = ptr.tag_id
        WHERE ptr.product_id = p.id) as tags,
       (SELECT json_agg(json_build_object(
         'id', pv.id,
         'sku', pv.sku,
         'variant_attributes', pv.variant_attributes,
         'price_adjustment', pv.price_adjustment,
         'stock_quantity', pv.stock_quantity,
         'image_url', pv.image_url,
         'image_urls', (SELECT COALESCE(array_agg(pm.image_url ORDER BY pm.display_order, pm.id), ARRAY[]::text[])
                        FROM product_media pm
                        WHERE pm.variant_id = pv.id AND pm.type = 'image'),
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
      
      // Upload qua server (local storage)
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

    // Check and send low stock alert if stock is below threshold
    if (product.stock_quantity < 10) {
      checkAndSendLowStockAlert(
        product.id,
        null,
        product.stock_quantity,
        10
      ).catch(err => {
        logger.error('Failed to check low stock alert', err instanceof Error ? err : new Error(String(err)));
      });
    }

    // Xử lý image URLs từ body (nếu có)
    const imageUrls = Array.isArray(body.image_urls) 
      ? body.image_urls 
      : typeof body.image_urls === 'string' 
        ? [body.image_urls] 
        : [];

    // Xử lý image files upload
  let uploadedImageUrls: string[] = [];
  if (files?.image_files && files.image_files.length > 0) {
    const uploadResult = await uploadMultipleFiles(
      files.image_files.map(file => ({
        buffer: file.buffer,
        fileName: file.originalname,
        mimeType: file.mimetype,
      }))
    );
    uploadedImageUrls = uploadResult.urls;
  }

    // Kết hợp tất cả image URLs
    const allImageUrls = [...imageUrls, ...uploadedImageUrls];

    // Lưu images vào product_media
    if (allImageUrls.length > 0) {
      for (let i = 0; i < allImageUrls.length; i++) {
        await pool.query(
          `INSERT INTO product_media (product_id, variant_id, type, image_url, display_order, is_primary)
           VALUES ($1, NULL, 'image', $2, $3, $4)`,
          [product.id, allImageUrls[i], i, i === 0] // Ảnh đầu tiên là primary, variant_id = NULL cho product images
        );
      }
    }

    // Nếu có videoUrl, lưu vào product_media với type = 'video'
    if (videoUrl) {
      await pool.query(
        `INSERT INTO product_media (product_id, variant_id, type, image_url, display_order, is_primary)
         VALUES ($1, NULL, 'video', $2, 0, FALSE)`,
        [product.id, videoUrl] // variant_id = NULL cho product video
      );
    }

    // Xử lý tags nếu có
    if (body.tag_ids && Array.isArray(body.tag_ids) && body.tag_ids.length > 0) {
      await syncProductTags(product.id, body.tag_ids);
    } else if (body.tag_names && Array.isArray(body.tag_names) && body.tag_names.length > 0) {
      // Nếu gửi tag_names thay vì tag_ids, tạo tags mới hoặc lấy tags đã có
      const tagIds: number[] = [];
      for (const tagName of body.tag_names) {
        if (typeof tagName === 'string' && tagName.trim()) {
          const tagId = await ensureTagExists(tagName.trim());
          tagIds.push(tagId);
        }
      }
      if (tagIds.length > 0) {
        await syncProductTags(product.id, tagIds);
      }
    }

    // Lấy lại product với images, video và tags
    const finalResult = await pool.query(
      `SELECT p.*,
              c.name as category_name,
              (SELECT COALESCE(array_agg(pm.image_url ORDER BY pm.display_order, pm.id), ARRAY[]::text[])
               FROM product_media pm
               WHERE pm.product_id = p.id AND pm.type = 'image') AS image_urls,
              (SELECT pm.image_url
               FROM product_media pm
               WHERE pm.product_id = p.id AND pm.type = 'video'
               ORDER BY pm.display_order, pm.id
               LIMIT 1) AS video_url,
              (SELECT json_agg(json_build_object('id', pt.id, 'name', pt.name, 'slug', pt.slug))
               FROM product_tags pt
               INNER JOIN product_tag_relations ptr ON pt.id = ptr.tag_id
               WHERE ptr.product_id = p.id) AS tags
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.id = $1`,
      [product.id]
    );

    return ResponseHandler.created(res, finalResult.rows[0], 'Thêm sản phẩm thành công');
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

    // Thêm updated_at = NOW() (không cần parameter, không tăng paramCount)
    updateFields.push(`updated_at = NOW()`);
    
    // Thêm id vào values và tăng paramCount cho WHERE clause
    paramCount++;
    values.push(id);

    const result = await pool.query(
      `UPDATE products SET ${updateFields.join(', ')} WHERE id = $${paramCount} AND deleted_at IS NULL
       RETURNING id, category_id, sku, name, description, price, stock_quantity, brand, view_count, sold_count, is_active, created_at, updated_at`,
      values
    );

    // Check and send low stock alert if stock_quantity was updated
    if (updates.stock_quantity !== undefined && result.rows.length > 0) {
      const updatedProduct = result.rows[0];
      checkAndSendLowStockAlert(
        updatedProduct.id,
        null,
        updatedProduct.stock_quantity,
        10
      ).catch(err => {
        logger.error('Failed to check low stock alert', err instanceof Error ? err : new Error(String(err)));
      });
    }

    // Xử lý cập nhật images nếu có image_urls trong body
    if (updates.image_urls !== undefined) {
      try {
        // Xóa tất cả images cũ của product (không phải của variant)
        await pool.query(
          `DELETE FROM product_media WHERE product_id = $1 AND type = 'image' AND variant_id IS NULL`,
          [id]
        );

        // Thêm images mới
        const imageUrls = Array.isArray(updates.image_urls) 
          ? updates.image_urls 
          : typeof updates.image_urls === 'string' 
            ? [updates.image_urls] 
            : [];

        if (imageUrls.length > 0) {
          for (let i = 0; i < imageUrls.length; i++) {
            try {
              await pool.query(
                `INSERT INTO product_media (product_id, variant_id, type, image_url, display_order, is_primary)
                 VALUES ($1, NULL, 'image', $2, $3, $4)`,
                [id, imageUrls[i], i, i === 0] // Ảnh đầu tiên là primary, variant_id = NULL cho product images
              );
            } catch (imageError: any) {
              logger.error('Error inserting product image', imageError instanceof Error ? imageError : new Error(String(imageError)), {
                productId: id,
                imageIndex: i,
                imageUrl: imageUrls[i],
                errorMessage: imageError.message,
                errorCode: imageError.code,
              });
              throw new Error(`Lỗi khi lưu hình ảnh thứ ${i + 1}: ${imageError.message || 'Unknown error'}`);
            }
          }
        }
      } catch (imageError: any) {
        logger.error('Error updating product images', imageError instanceof Error ? imageError : new Error(String(imageError)), {
          productId: id,
          imageUrls: updates.image_urls,
        });
        throw imageError; // Re-throw để catch ở ngoài xử lý
      }
    }

    // Xử lý cập nhật video nếu có video_url trong body
    if (updates.video_url !== undefined) {
      // Xóa video cũ của product (không phải của variant)
      await pool.query(
        `DELETE FROM product_media WHERE product_id = $1 AND type = 'video' AND variant_id IS NULL`,
        [id]
      );

    // Xử lý tags nếu có
    if (updates.tag_ids !== undefined) {
      if (Array.isArray(updates.tag_ids) && updates.tag_ids.length > 0) {
        await syncProductTags(Number(id), updates.tag_ids);
      } else {
        // Xóa tất cả tags nếu tag_ids là mảng rỗng
        await syncProductTags(Number(id), []);
      }
    } else if (updates.tag_names !== undefined && Array.isArray(updates.tag_names) && updates.tag_names.length > 0) {
      // Nếu gửi tag_names thay vì tag_ids, tạo tags mới hoặc lấy tags đã có
      const tagIds: number[] = [];
      for (const tagName of updates.tag_names) {
        if (typeof tagName === 'string' && tagName.trim()) {
          const tagId = await ensureTagExists(tagName.trim());
          tagIds.push(tagId);
        }
      }
      await syncProductTags(Number(id), tagIds);
    }

      // Thêm video mới nếu có
      if (updates.video_url) {
        await pool.query(
          `INSERT INTO product_media (product_id, variant_id, type, image_url, display_order, is_primary)
           VALUES ($1, NULL, 'video', $2, 0, FALSE)`,
          [id, updates.video_url] // variant_id = NULL cho product video
        );
      }
    }

    // Lấy lại product với images, video và tags
    const finalResult = await pool.query(
      `SELECT p.*,
              c.name as category_name,
              (SELECT COALESCE(array_agg(pm.image_url ORDER BY pm.display_order, pm.id), ARRAY[]::text[])
               FROM product_media pm
               WHERE pm.product_id = p.id AND pm.type = 'image' AND pm.variant_id IS NULL) AS image_urls,
              (SELECT pm.image_url
               FROM product_media pm
               WHERE pm.product_id = p.id AND pm.type = 'video' AND pm.variant_id IS NULL
               ORDER BY pm.display_order, pm.id
               LIMIT 1) AS video_url,
              (SELECT json_agg(json_build_object('id', pt.id, 'name', pt.name, 'slug', pt.slug))
               FROM product_tags pt
               INNER JOIN product_tag_relations ptr ON pt.id = ptr.tag_id
               WHERE ptr.product_id = p.id) AS tags
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.id = $1`,
      [id]
    );

    return ResponseHandler.success(res, finalResult.rows[0], 'Cập nhật sản phẩm thành công');
  } catch (error: any) {
    logger.error('Error updating product', error instanceof Error ? error : new Error(String(error)), {
      productId: id,
      body: req.body,
      errorMessage: error.message,
      errorCode: error.code,
      errorDetail: error.detail,
      errorHint: error.hint,
      errorStack: error.stack,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, `Lỗi khi cập nhật sản phẩm: ${error.message || 'Unknown error'}`, error);
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

    return ResponseHandler.success(res, null, 'Xóa sản phẩm thành công');
  } catch (error: any) {
    logger.error('Error deleting product', error instanceof Error ? error : new Error(String(error)), {
      productId: id,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi xóa sản phẩm', error);
  }
};

