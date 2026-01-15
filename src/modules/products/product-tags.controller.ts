import { Response } from 'express';
import { AuthRequest } from '../../types/request.types';
import { pool } from '../../connections';
import { createTagSchema, updateTagSchema } from './product-tags.validation';
import { ResponseHandler } from '../../utils/response';
import { logger } from '../../utils/logging';

// Helper: Tạo slug từ name
function createSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Helper: Đảm bảo tag tồn tại, nếu chưa thì tạo mới
export async function ensureTagExists(name: string, slug?: string): Promise<number> {
  const tagSlug = slug || createSlug(name);
  
  // Tìm tag theo slug
  const existingTag = await pool.query(
    'SELECT id FROM product_tags WHERE slug = $1',
    [tagSlug]
  );
  
  if (existingTag.rows.length > 0) {
    return existingTag.rows[0].id;
  }
  
  // Tạo tag mới
  const newTag = await pool.query(
    'INSERT INTO product_tags (name, slug) VALUES ($1, $2) RETURNING id',
    [name, tagSlug]
  );
  
  return newTag.rows[0].id;
}

// Helper: Đồng bộ tags cho sản phẩm
export async function syncProductTags(productId: number, tagIds: number[]): Promise<void> {
  // Validate input
  if (!Number.isInteger(productId) || productId <= 0) {
    throw new Error(`Invalid productId: ${productId}. Must be a positive integer.`);
  }
  
  // Validate tagIds
  const validTagIds = tagIds.filter(id => Number.isInteger(id) && id > 0);
  if (tagIds.length > 0 && validTagIds.length !== tagIds.length) {
    logger.warn('Some invalid tag IDs were filtered out', {
      productId,
      originalTagIds: tagIds,
      validTagIds,
    });
  }
  
  // Xóa tất cả relations cũ
  await pool.query(
    'DELETE FROM product_tag_relations WHERE product_id = $1',
    [productId]
  );
  
  // Thêm relations mới
  if (validTagIds.length > 0) {
    const values = validTagIds.map((_, index) => `($1, $${index + 2})`).join(', ');
    const params = [productId, ...validTagIds];
    await pool.query(
      `INSERT INTO product_tag_relations (product_id, tag_id) VALUES ${values}`,
      params
    );
  }
}

// Lấy tất cả tags
export const getAllTags = async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT pt.*, 
       COUNT(DISTINCT ptr.product_id) as product_count
       FROM product_tags pt
       LEFT JOIN product_tag_relations ptr ON pt.id = ptr.tag_id
       LEFT JOIN products p ON ptr.product_id = p.id AND p.deleted_at IS NULL
       GROUP BY pt.id
       ORDER BY pt.name ASC`
    );
    
    return ResponseHandler.success(res, result.rows);
  } catch (error: any) {
    logger.error('Error fetching tags', error instanceof Error ? error : new Error(String(error)), {
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi lấy danh sách tags', error);
  }
};

// Lấy tag theo ID
export const getTagById = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT pt.*, 
       COUNT(DISTINCT ptr.product_id) as product_count
       FROM product_tags pt
       LEFT JOIN product_tag_relations ptr ON pt.id = ptr.tag_id
       LEFT JOIN products p ON ptr.product_id = p.id AND p.deleted_at IS NULL
       WHERE pt.id = $1
       GROUP BY pt.id`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return ResponseHandler.notFound(res, 'Tag không tồn tại');
    }
    
    return ResponseHandler.success(res, result.rows[0]);
  } catch (error: any) {
    logger.error('Error fetching tag', error instanceof Error ? error : new Error(String(error)), {
      tagId: id,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi lấy thông tin tag', error);
  }
};

// Tạo tag mới
export const createTag = async (req: AuthRequest, res: Response) => {
  try {
    const validated = createTagSchema.parse(req.body);
    
    // Kiểm tra slug đã tồn tại chưa
    const existingTag = await pool.query(
      'SELECT id FROM product_tags WHERE slug = $1',
      [validated.slug]
    );
    
    if (existingTag.rows.length > 0) {
      return ResponseHandler.conflict(res, 'Tag với slug này đã tồn tại');
    }
    
    const result = await pool.query(
      'INSERT INTO product_tags (name, slug) VALUES ($1, $2) RETURNING id, name, slug, created_at',
      [validated.name, validated.slug]
    );
    
    return ResponseHandler.created(res, result.rows[0], 'Tạo tag thành công');
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return ResponseHandler.badRequest(res, 'Dữ liệu không hợp lệ', error.errors);
    }
    logger.error('Error creating tag', error instanceof Error ? error : new Error(String(error)), {
      body: req.body,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi tạo tag', error);
  }
};

// Cập nhật tag
export const updateTag = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  try {
    const validated = updateTagSchema.parse(req.body);
    
    // Kiểm tra tag tồn tại
    const tagCheck = await pool.query(
      'SELECT id FROM product_tags WHERE id = $1',
      [id]
    );
    
    if (tagCheck.rows.length === 0) {
      return ResponseHandler.notFound(res, 'Tag không tồn tại');
    }
    
    // Kiểm tra slug trùng (nếu có slug mới)
    if (validated.slug) {
      const existingTag = await pool.query(
        'SELECT id FROM product_tags WHERE slug = $1 AND id != $2',
        [validated.slug, id]
      );
      
      if (existingTag.rows.length > 0) {
        return ResponseHandler.conflict(res, 'Tag với slug này đã tồn tại');
      }
    }
    
    // Build update query
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 0;
    
    if (validated.name) {
      paramCount++;
      updates.push(`name = $${paramCount}`);
      values.push(validated.name);
    }
    
    if (validated.slug) {
      paramCount++;
      updates.push(`slug = $${paramCount}`);
      values.push(validated.slug);
    }
    
    if (updates.length === 0) {
      return ResponseHandler.badRequest(res, 'Không có dữ liệu để cập nhật');
    }
    
    paramCount++;
    values.push(id);
    
    const result = await pool.query(
      `UPDATE product_tags SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING id, name, slug, created_at`,
      values
    );
    
    return ResponseHandler.success(res, result.rows[0], 'Cập nhật tag thành công');
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return ResponseHandler.badRequest(res, 'Dữ liệu không hợp lệ', error.errors);
    }
    logger.error('Error updating tag', error instanceof Error ? error : new Error(String(error)), {
      tagId: id,
      body: req.body,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi cập nhật tag', error);
  }
};

// Xóa tag
export const deleteTag = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  try {
    // Kiểm tra tag tồn tại
    const tagCheck = await pool.query(
      'SELECT id FROM product_tags WHERE id = $1',
      [id]
    );
    
    if (tagCheck.rows.length === 0) {
      return ResponseHandler.notFound(res, 'Tag không tồn tại');
    }
    
    // Xóa tag (CASCADE sẽ xóa relations tự động)
    await pool.query('DELETE FROM product_tags WHERE id = $1', [id]);
    
    return ResponseHandler.success(res, null, 'Xóa tag thành công');
  } catch (error: any) {
    logger.error('Error deleting tag', error instanceof Error ? error : new Error(String(error)), {
      tagId: id,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi xóa tag', error);
  }
};

// Lấy sản phẩm theo tag
export const getProductsByTag = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { page = 1, limit = 20 } = req.query;
  const pageNum = parseInt(page as string) || 1;
  const limitNum = parseInt(limit as string) || 20;
  const userId = req.user?.id || null;
  
  try {
    // Kiểm tra tag tồn tại
    const tagCheck = await pool.query(
      'SELECT id, name FROM product_tags WHERE id = $1',
      [id]
    );
    
    if (tagCheck.rows.length === 0) {
      return ResponseHandler.notFound(res, 'Tag không tồn tại');
    }
    
    const selectClause =
      'SELECT p.*, c.name as category_name, ' +
      "(SELECT COALESCE(array_agg(pm.image_url ORDER BY pm.display_order, pm.id), ARRAY[]::text[]) " +
      "FROM (SELECT DISTINCT ON (pm.image_url) pm.image_url, pm.display_order, pm.id " +
      "FROM product_media pm WHERE pm.product_id = p.id AND pm.type = 'image' " +
      "ORDER BY pm.image_url, pm.display_order, pm.id) pm) AS image_urls, " +
      "(SELECT pm.image_url FROM product_media pm WHERE pm.product_id = p.id AND pm.type = 'video' ORDER BY pm.display_order, pm.id LIMIT 1) AS video_url, " +
      'CASE WHEN $1::uuid IS NULL THEN false ELSE EXISTS (SELECT 1 FROM wishlist w WHERE w.user_id = $1::uuid AND w.product_id = p.id) END as is_in_wishlist ';
    
    const baseQuery =
      'FROM products p ' +
      'LEFT JOIN categories c ON p.category_id = c.id ' +
      'INNER JOIN product_tag_relations ptr ON p.id = ptr.product_id ' +
      'WHERE ptr.tag_id = $2 AND p.is_active = TRUE AND p.deleted_at IS NULL';
    
    let query = selectClause + baseQuery;
    const params: any[] = [userId, id];
    
    // Count total
    const countQuery = query.replace(selectClause, 'SELECT COUNT(*) ');
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);
    
    // Add pagination
    query += ` ORDER BY p.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limitNum);
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
      tag: tagCheck.rows[0],
    });
  } catch (error: any) {
    logger.error('Error fetching products by tag', error instanceof Error ? error : new Error(String(error)), {
      tagId: id,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi lấy danh sách sản phẩm theo tag', error);
  }
};
