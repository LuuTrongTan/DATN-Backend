import { Response } from 'express';
import { AuthRequest } from '../../types/request.types';
import { pool } from '../../connections';
import { createCouponSchema, updateCouponSchema, applyCouponSchema } from './coupons.validation';

// Get all coupons (admin/staff)
export const getCoupons = async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 20, is_active } = req.query;
    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 20;

    let query = 'SELECT * FROM coupons WHERE 1=1';
    const params: any[] = [];
    let paramCount = 0;

    if (is_active !== undefined) {
      paramCount++;
      query += ` AND is_active = $${paramCount}`;
      params.push(is_active === 'true');
    }

    paramCount++;
    query += ` ORDER BY created_at DESC LIMIT $${paramCount}`;
    params.push(limitNum);

    paramCount++;
    query += ` OFFSET $${paramCount}`;
    params.push((pageNum - 1) * limitNum);

    const result = await pool.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM coupons WHERE 1=1';
    const countParams: any[] = [];
    let countParamCount = 0;

    if (is_active !== undefined) {
      countParamCount++;
      countQuery += ` AND is_active = $${countParamCount}`;
      countParams.push(is_active === 'true');
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get coupon by ID
export const getCouponById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const result = await pool.query('SELECT * FROM coupons WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Mã giảm giá không tồn tại',
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Create coupon (admin/staff)
export const createCoupon = async (req: AuthRequest, res: Response) => {
  try {
    const validated = createCouponSchema.parse(req.body);
    const userId = req.user!.id;

    // Check if code already exists
    const existingCheck = await pool.query(
      'SELECT id FROM coupons WHERE code = $1',
      [validated.code.toUpperCase()]
    );

    if (existingCheck.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Mã giảm giá đã tồn tại',
      });
    }

    // Validate dates
    const startDate = new Date(validated.start_date);
    const endDate = new Date(validated.end_date);

    if (endDate <= startDate) {
      return res.status(400).json({
        success: false,
        message: 'Ngày kết thúc phải sau ngày bắt đầu',
      });
    }

    // Validate discount value
    if (validated.discount_type === 'percentage' && validated.discount_value > 100) {
      return res.status(400).json({
        success: false,
        message: 'Phần trăm giảm giá không được vượt quá 100%',
      });
    }

    const result = await pool.query(
      `INSERT INTO coupons (
        code, name, description, discount_type, discount_value,
        min_order_amount, max_discount_amount, usage_limit, user_limit,
        start_date, end_date, applicable_to, category_id, product_id, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *`,
      [
        validated.code.toUpperCase(),
        validated.name,
        validated.description || null,
        validated.discount_type,
        validated.discount_value,
        validated.min_order_amount || 0,
        validated.max_discount_amount || null,
        validated.usage_limit || null,
        validated.user_limit || 1,
        validated.start_date,
        validated.end_date,
        validated.applicable_to || 'all',
        validated.category_id || null,
        validated.product_id || null,
        userId,
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Tạo mã giảm giá thành công',
      data: result.rows[0],
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({
        success: false,
        message: 'Dữ liệu không hợp lệ',
        errors: error.errors,
      });
    }
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Update coupon (admin/staff)
export const updateCoupon = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const validated = updateCouponSchema.parse(req.body);

    // Check if coupon exists
    const checkResult = await pool.query('SELECT id FROM coupons WHERE id = $1', [id]);
    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Mã giảm giá không tồn tại',
      });
    }

    // Build update query
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 0;

    if (validated.name !== undefined) {
      paramCount++;
      updates.push(`name = $${paramCount}`);
      values.push(validated.name);
    }
    if (validated.description !== undefined) {
      paramCount++;
      updates.push(`description = $${paramCount}`);
      values.push(validated.description);
    }
    if (validated.discount_type !== undefined) {
      paramCount++;
      updates.push(`discount_type = $${paramCount}`);
      values.push(validated.discount_type);
    }
    if (validated.discount_value !== undefined) {
      paramCount++;
      updates.push(`discount_value = $${paramCount}`);
      values.push(validated.discount_value);
    }
    if (validated.min_order_amount !== undefined) {
      paramCount++;
      updates.push(`min_order_amount = $${paramCount}`);
      values.push(validated.min_order_amount);
    }
    if (validated.max_discount_amount !== undefined) {
      paramCount++;
      updates.push(`max_discount_amount = $${paramCount}`);
      values.push(validated.max_discount_amount);
    }
    if (validated.usage_limit !== undefined) {
      paramCount++;
      updates.push(`usage_limit = $${paramCount}`);
      values.push(validated.usage_limit);
    }
    if (validated.user_limit !== undefined) {
      paramCount++;
      updates.push(`user_limit = $${paramCount}`);
      values.push(validated.user_limit);
    }
    if (validated.start_date !== undefined) {
      paramCount++;
      updates.push(`start_date = $${paramCount}`);
      values.push(validated.start_date);
    }
    if (validated.end_date !== undefined) {
      paramCount++;
      updates.push(`end_date = $${paramCount}`);
      values.push(validated.end_date);
    }
    if (validated.is_active !== undefined) {
      paramCount++;
      updates.push(`is_active = $${paramCount}`);
      values.push(validated.is_active);
    }
    if (validated.applicable_to !== undefined) {
      paramCount++;
      updates.push(`applicable_to = $${paramCount}`);
      values.push(validated.applicable_to);
    }
    if (validated.category_id !== undefined) {
      paramCount++;
      updates.push(`category_id = $${paramCount}`);
      values.push(validated.category_id);
    }
    if (validated.product_id !== undefined) {
      paramCount++;
      updates.push(`product_id = $${paramCount}`);
      values.push(validated.product_id);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Không có trường nào để cập nhật',
      });
    }

    paramCount++;
    updates.push(`updated_at = NOW()`);
    paramCount++;
    values.push(id);

    const result = await pool.query(
      `UPDATE coupons SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );

    res.json({
      success: true,
      message: 'Cập nhật mã giảm giá thành công',
      data: result.rows[0],
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({
        success: false,
        message: 'Dữ liệu không hợp lệ',
        errors: error.errors,
      });
    }
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Delete coupon (admin/staff)
export const deleteCoupon = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const result = await pool.query('DELETE FROM coupons WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Mã giảm giá không tồn tại',
      });
    }

    res.json({
      success: true,
      message: 'Xóa mã giảm giá thành công',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Apply coupon (customer)
export const applyCoupon = async (req: AuthRequest, res: Response) => {
  try {
    const validated = applyCouponSchema.parse(req.body);
    const userId = req.user!.id;

    // Get coupon
    const couponResult = await pool.query(
      'SELECT * FROM coupons WHERE code = $1 AND is_active = TRUE',
      [validated.code.toUpperCase()]
    );

    if (couponResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Mã giảm giá không tồn tại hoặc đã bị vô hiệu hóa',
      });
    }

    const coupon = couponResult.rows[0];

    // Check date validity
    const now = new Date();
    const startDate = new Date(coupon.start_date);
    const endDate = new Date(coupon.end_date);

    if (now < startDate) {
      return res.status(400).json({
        success: false,
        message: 'Mã giảm giá chưa có hiệu lực',
      });
    }

    if (now > endDate) {
      return res.status(400).json({
        success: false,
        message: 'Mã giảm giá đã hết hạn',
      });
    }

    // Check usage limit
    if (coupon.usage_limit && coupon.used_count >= coupon.usage_limit) {
      return res.status(400).json({
        success: false,
        message: 'Mã giảm giá đã hết lượt sử dụng',
      });
    }

    // Check user limit
    const userUsageCount = await pool.query(
      'SELECT COUNT(*) FROM coupon_usage WHERE coupon_id = $1 AND user_id = $2',
      [coupon.id, userId]
    );

    if (parseInt(userUsageCount.rows[0].count) >= coupon.user_limit) {
      return res.status(400).json({
        success: false,
        message: 'Bạn đã sử dụng hết lượt cho mã giảm giá này',
      });
    }

    // Check min order amount
    if (validated.order_amount < coupon.min_order_amount) {
      return res.status(400).json({
        success: false,
        message: `Đơn hàng tối thiểu ${coupon.min_order_amount.toLocaleString('vi-VN')} VNĐ để sử dụng mã này`,
      });
    }

    // Check applicable to
    if (coupon.applicable_to === 'category') {
      if (!validated.category_ids || !validated.category_ids.includes(coupon.category_id!)) {
        return res.status(400).json({
          success: false,
          message: 'Mã giảm giá không áp dụng cho danh mục này',
        });
      }
    }

    if (coupon.applicable_to === 'product') {
      if (!validated.product_ids || !validated.product_ids.includes(coupon.product_id!)) {
        return res.status(400).json({
          success: false,
          message: 'Mã giảm giá không áp dụng cho sản phẩm này',
        });
      }
    }

    // Calculate discount
    let discountAmount = 0;
    if (coupon.discount_type === 'percentage') {
      discountAmount = (validated.order_amount * coupon.discount_value) / 100;
      if (coupon.max_discount_amount && discountAmount > coupon.max_discount_amount) {
        discountAmount = coupon.max_discount_amount;
      }
    } else {
      discountAmount = coupon.discount_value;
    }

    // Ensure discount doesn't exceed order amount
    if (discountAmount > validated.order_amount) {
      discountAmount = validated.order_amount;
    }

    res.json({
      success: true,
      message: 'Áp dụng mã giảm giá thành công',
      data: {
        coupon: {
          id: coupon.id,
          code: coupon.code,
          name: coupon.name,
          discount_type: coupon.discount_type,
          discount_value: coupon.discount_value,
        },
        discount_amount: discountAmount,
        final_amount: validated.order_amount - discountAmount,
      },
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({
        success: false,
        message: 'Dữ liệu không hợp lệ',
        errors: error.errors,
      });
    }
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

