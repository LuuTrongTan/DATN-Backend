import { Response } from 'express';
import { AuthRequest } from '../../types/request.types';
import { pool } from '../../connections';
import { productSchema } from './products.validation';

// UC-07: Tìm kiếm và lọc sản phẩm
export const searchProducts = async (req: AuthRequest, res: Response) => {
  try {
    const { q, category_id, min_price, max_price, page = 1, limit = 20 } = req.query;

    let query = 'SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.is_active = TRUE';
    const params: any[] = [];
    let paramCount = 0;

    if (q) {
      paramCount++;
      query += ` AND (p.name ILIKE $${paramCount} OR p.description ILIKE $${paramCount})`;
      params.push(`%${q}%`);
    }

    if (category_id) {
      paramCount++;
      query += ` AND p.category_id = $${paramCount}`;
      params.push(category_id);
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
    const countQuery = query.replace('SELECT p.*, c.name as category_name', 'SELECT COUNT(*)');
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);

    // Add pagination
    paramCount++;
    query += ` ORDER BY p.created_at DESC LIMIT $${paramCount}`;
    params.push(limit);

    paramCount++;
    query += ` OFFSET $${paramCount}`;
    params.push((page - 1) * limit);

    const result = await pool.query(query, params);

    res.json({
      products: result.rows,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total,
        totalPages: Math.ceil(total / parseInt(limit as string)),
      },
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// Get all products
export const getProducts = async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const result = await pool.query(
      `SELECT p.*, c.name as category_name
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.is_active = TRUE
       ORDER BY p.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, (page - 1) * limit]
    );

    const countResult = await pool.query('SELECT COUNT(*) FROM products WHERE is_active = TRUE');
    const total = parseInt(countResult.rows[0].count);

    res.json({
      products: result.rows,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total,
        totalPages: Math.ceil(total / parseInt(limit as string)),
      },
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// Get product by ID
export const getProductById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT p.*, c.name as category_name,
       (SELECT json_agg(json_build_object(
         'id', pv.id,
         'variant_type', pv.variant_type,
         'variant_value', pv.variant_value,
         'price_adjustment', pv.price_adjustment,
         'stock_quantity', pv.stock_quantity
       )) FROM product_variants pv WHERE pv.product_id = p.id) as variants
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Sản phẩm không tồn tại' });
    }

    res.json({ product: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// UC-15: Thêm sản phẩm
export const createProduct = async (req: AuthRequest, res: Response) => {
  try {
    const validated = productSchema.parse(req.body);

    // Check if category exists
    const categoryCheck = await pool.query(
      'SELECT id FROM categories WHERE id = $1',
      [validated.category_id]
    );

    if (categoryCheck.rows.length === 0) {
      return res.status(400).json({ message: 'Danh mục không tồn tại' });
    }

    const result = await pool.query(
      `INSERT INTO products (category_id, name, description, price, stock_quantity, image_urls, video_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        validated.category_id,
        validated.name,
        validated.description || null,
        validated.price,
        validated.stock_quantity,
        validated.image_urls,
        validated.video_url || null,
      ]
    );

    res.status(201).json({
      message: 'Thêm sản phẩm thành công',
      product: result.rows[0],
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

// UC-16: Sửa sản phẩm
export const updateProduct = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Check if product exists
    const productCheck = await pool.query('SELECT id FROM products WHERE id = $1', [id]);

    if (productCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Sản phẩm không tồn tại' });
    }

    // Validate updates
    if (updates.name === '' || updates.stock_quantity === null) {
      return res.status(400).json({
        message: 'Tên sản phẩm và số lượng không được để trống',
      });
    }

    const allowedFields = ['name', 'description', 'price', 'stock_quantity', 'image_urls', 'video_url', 'category_id'];
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
      return res.status(400).json({ message: 'Không có trường nào để cập nhật' });
    }

    paramCount++;
    updateFields.push(`updated_at = NOW()`);
    paramCount++;
    values.push(id);

    const result = await pool.query(
      `UPDATE products SET ${updateFields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );

    res.json({
      message: 'Cập nhật sản phẩm thành công',
      product: result.rows[0],
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// UC-17: Xóa sản phẩm
export const deleteProduct = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const result = await pool.query('DELETE FROM products WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Sản phẩm không tồn tại' });
    }

    res.json({ message: 'Xóa sản phẩm thành công' });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

