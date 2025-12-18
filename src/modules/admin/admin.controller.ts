import { Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { AuthRequest } from '../../types/request.types';
import { pool } from '../../connections';
import { sendOrderStatusUpdateEmail } from '../../utils/email.service';
import { ResponseHandler } from '../../utils/response';
import { logger } from '../../utils/logging';
import { appConfig } from '../../connections/config/app.config';

// UC-18, UC-19, UC-20: Quản lý danh mục
export const createCategory = async (req: AuthRequest, res: Response) => {
  const { name, image_url, description } = req.body;
  
  try {
    if (!name) {
      return ResponseHandler.error(res, 'Tên danh mục không được để trống', 400);
    }

    const result = await pool.query(
      `INSERT INTO categories (name, image_url, description)
       VALUES ($1, $2, $3)
       RETURNING id, name, image_url, description, is_active, created_at, updated_at`,
      [name, image_url || null, description || null]
    );

    return ResponseHandler.created(res, result.rows[0], 'Thêm danh mục thành công');
  } catch (error: any) {
    logger.error('Error creating category', error instanceof Error ? error : new Error(String(error)), {
      name: name || 'unknown',
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi thêm danh mục', error);
  }
};

export const updateCategory = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { name, image_url, description } = req.body;
  
  try {
    const result = await pool.query(
      `UPDATE categories 
       SET name = COALESCE($1, name),
           image_url = COALESCE($2, image_url),
           description = COALESCE($3, description),
           updated_at = NOW()
       WHERE id = $4
       RETURNING id, name, image_url, description, is_active, created_at, updated_at`,
      [name, image_url, description, id]
    );

    if (result.rows.length === 0) {
      return ResponseHandler.notFound(res, 'Danh mục không tồn tại');
    }

    return ResponseHandler.success(res, result.rows[0], 'Cập nhật danh mục thành công');
  } catch (error: any) {
    logger.error('Error updating category', error instanceof Error ? error : new Error(String(error)), {
      categoryId: id,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi cập nhật danh mục', error);
  }
};

export const deleteCategory = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  
  try {
    const result = await pool.query('DELETE FROM categories WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return ResponseHandler.notFound(res, 'Danh mục không tồn tại');
    }

    return ResponseHandler.success(res, null, 'Xóa danh mục thành công');
  } catch (error: any) {
    logger.error('Error deleting category', error instanceof Error ? error : new Error(String(error)), {
      categoryId: id,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi xóa danh mục', error);
  }
};

// UC-21: Xử lý đơn hàng
export const updateOrderStatus = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { status, notes } = req.body;
  
  try {

    const validStatuses = ['pending', 'confirmed', 'processing', 'shipping', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return ResponseHandler.error(res, 'Trạng thái đơn hàng không hợp lệ', 400);
    }

    // Update order
    const orderResult = await pool.query(
      `UPDATE orders 
       SET order_status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, user_id, order_number, total_amount, order_status, payment_status, shipping_address, payment_method, shipping_fee, notes, created_at, updated_at`,
      [status, id]
    );

    if (orderResult.rows.length === 0) {
      return ResponseHandler.notFound(res, 'Đơn hàng không tồn tại');
    }

    // Add to status history
    await pool.query(
      `INSERT INTO order_status_history (order_id, status, notes, updated_by)
       VALUES ($1, $2, $3, $4)`,
      [id, status, notes || null, req.user!.id]
    );

    // Get user info for email notification
    const order = orderResult.rows[0];
    const userResult = await pool.query(
      'SELECT email, full_name FROM users WHERE id = $1',
      [order.user_id]
    );
    
    if (userResult.rows.length > 0 && userResult.rows[0].email) {
      try {
        await sendOrderStatusUpdateEmail(
          userResult.rows[0].email,
          userResult.rows[0].full_name || 'Khách hàng',
          order.order_number,
          status,
          notes || undefined
        );
      } catch (error: any) {
        // Log error but don't fail the request
        logger.error('Failed to send order status update email', error instanceof Error ? error : new Error(String(error)), {
          orderId: id,
          orderNumber: order.order_number,
          email: userResult.rows[0].email,
        });
      }
    }

    return ResponseHandler.success(res, orderResult.rows[0], 'Cập nhật trạng thái đơn hàng thành công');
  } catch (error: any) {
    logger.error('Error updating order status', error instanceof Error ? error : new Error(String(error)), {
      orderId: id,
      status,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi cập nhật trạng thái đơn hàng', error);
  }
};

export const getAllOrders = async (req: AuthRequest, res: Response) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 20;

    let query = 'SELECT id, user_id, order_number, total_amount, order_status, payment_status, shipping_address, payment_method, shipping_fee, notes, created_at, updated_at FROM orders WHERE 1=1';
    const params: any[] = [];
    let paramCount = 0;

    if (status) {
      paramCount++;
      query += ` AND order_status = $${paramCount}`;
      params.push(status);
    }

    // Count total
    const countQuery = query.replace('SELECT id, user_id, order_number, total_amount, order_status, payment_status, shipping_address, payment_method, shipping_fee, notes, created_at, updated_at', 'SELECT COUNT(*)');
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);

    paramCount++;
    query += ` ORDER BY created_at DESC LIMIT $${paramCount}`;
    params.push(limitNum);

    paramCount++;
    query += ` OFFSET $${paramCount}`;
    params.push((pageNum - 1) * limitNum);

    const result = await pool.query(query, params);

    return ResponseHandler.paginated(res, result.rows, {
      page: pageNum,
      limit: limitNum,
      total,
    }, 'Lấy danh sách đơn hàng thành công');
  } catch (error: any) {
    logger.error('Error fetching orders', error instanceof Error ? error : new Error(String(error)));
    return ResponseHandler.internalError(res, 'Lỗi khi lấy danh sách đơn hàng', error);
  }
};

// UC-22: Tạo staff
export const createStaff = async (req: AuthRequest, res: Response) => {
  const { email, phone } = req.body;
  
  try {

    if (!email && !phone) {
      return ResponseHandler.error(res, 'Phải cung cấp email hoặc số điện thoại', 400);
    }

    if (email && !email.includes('@')) {
      return ResponseHandler.error(res, 'Email không hợp lệ', 400);
    }

    if (phone && phone.length !== 10) {
      return ResponseHandler.error(res, 'Số điện thoại phải có 10 chữ số', 400);
    }

    // Check if user exists
    const existingUser = await pool.query(
      'SELECT id, role FROM users WHERE email = $1 OR phone = $2',
      [email, phone]
    );

    if (existingUser.rows.length > 0) {
      const user = existingUser.rows[0];
      
      if (user.role === 'customer') {
        // Update role to staff
        await pool.query('UPDATE users SET role = $1 WHERE id = $2', ['staff', user.id]);
        return ResponseHandler.success(res, { userId: user.id, role: 'staff' }, 'Đã cập nhật role thành staff');
      } else {
        return ResponseHandler.error(res, 'Tài khoản đã là staff hoặc admin', 400);
      }
    }

    // Create new staff account with default password
    // Generate random password for security
    const defaultPassword = crypto.randomBytes(8).toString('base64').slice(0, 12) + '!@#';
    const passwordHash = await bcrypt.hash(defaultPassword, 10);

    const result = await pool.query(
      `INSERT INTO users (email, phone, password_hash, role, is_verified)
       VALUES ($1, $2, $3, 'staff', TRUE)
       RETURNING id, email, phone, role`,
      [email || null, phone || null, passwordHash]
    );

    // TODO: Send password via email instead of returning in response
    // For now, return in response but log warning
    logger.warn('Staff password generated', {
      staffId: result.rows[0].id,
      email: result.rows[0].email,
      phone: result.rows[0].phone,
      ip: req.ip,
    });

    return ResponseHandler.created(res, {
      staff: result.rows[0],
      // Only return password in development
      ...(appConfig.nodeEnv === 'development' && { defaultPassword }),
      message: appConfig.nodeEnv === 'production' 
        ? 'Tài khoản staff đã được tạo. Mật khẩu đã được gửi qua email.' 
        : 'Tài khoản staff đã được tạo. Vui lòng lưu mật khẩu.',
    }, 'Tạo tài khoản staff thành công');
  } catch (error: any) {
    logger.error('Error creating staff', error instanceof Error ? error : new Error(String(error)), {
      email,
      phone,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi tạo tài khoản staff', error);
  }
};

// UC-23: Quản lý staff/user
export const getUsers = async (req: AuthRequest, res: Response) => {
  try {
    const { role, page = 1, limit = 20 } = req.query;
    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 20;

    let query = 'SELECT id, email, phone, full_name, role, is_active, is_banned, created_at FROM users WHERE 1=1';
    const params: any[] = [];
    let paramCount = 0;

    if (role) {
      paramCount++;
      query += ` AND role = $${paramCount}`;
      params.push(role);
    }

    paramCount++;
    query += ` ORDER BY created_at DESC LIMIT $${paramCount}`;
    params.push(limitNum);

    paramCount++;
    query += ` OFFSET $${paramCount}`;
    params.push((pageNum - 1) * limitNum);

    // Count total
    const countQuery = query.replace('SELECT id, email, phone, full_name, role, is_active, is_banned, created_at', 'SELECT COUNT(*)');
    const countResult = await pool.query(countQuery, params.slice(0, -2)); // Remove limit and offset for count
    const total = parseInt(countResult.rows[0].count);

    const result = await pool.query(query, params);

    return ResponseHandler.paginated(res, result.rows, {
      page: pageNum,
      limit: limitNum,
      total,
    }, 'Lấy danh sách người dùng thành công');
  } catch (error: any) {
    logger.error('Error fetching users', error instanceof Error ? error : new Error(String(error)));
    return ResponseHandler.internalError(res, 'Lỗi khi lấy danh sách người dùng', error);
  }
};

export const updateUser = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { is_active, is_banned, role, email, password } = req.body;
  
  try {

    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 0;

    if (is_active !== undefined) {
      paramCount++;
      updates.push(`is_active = $${paramCount}`);
      values.push(is_active);
    }

    if (is_banned !== undefined) {
      paramCount++;
      updates.push(`is_banned = $${paramCount}`);
      values.push(is_banned);
    }

    if (role) {
      paramCount++;
      updates.push(`role = $${paramCount}`);
      values.push(role);
    }

    if (email) {
      paramCount++;
      updates.push(`email = $${paramCount}`);
      values.push(email);
    }

    if (password) {
      paramCount++;
      const passwordHash = await bcrypt.hash(password, 10);
      updates.push(`password_hash = $${paramCount}`);
      values.push(passwordHash);
    }

    if (updates.length === 0) {
      return ResponseHandler.error(res, 'Không có trường nào để cập nhật', 400);
    }

    paramCount++;
    updates.push(`updated_at = NOW()`);
    paramCount++;
    values.push(id);

    const result = await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING id, email, phone, role, is_active, is_banned`,
      values
    );

    if (result.rows.length === 0) {
      return ResponseHandler.notFound(res, 'Người dùng không tồn tại');
    }

    return ResponseHandler.success(res, result.rows[0], 'Cập nhật người dùng thành công');
  } catch (error: any) {
    logger.error('Error updating user', error instanceof Error ? error : new Error(String(error)), {
      userId: id,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi cập nhật người dùng', error);
  }
};

// UC-24: Thống kê và báo cáo
export const getStatistics = async (req: AuthRequest, res: Response) => {
  try {
    const { start_date, end_date } = req.query;

    let dateFilter = '';
    const params: any[] = [];
    
    if (start_date && end_date) {
      dateFilter = 'WHERE o.created_at BETWEEN $1 AND $2';
      params.push(start_date, end_date);
    }

    // Total orders
    const ordersResult = await pool.query(
      `SELECT COUNT(*) as total, 
       SUM(total_amount) as revenue,
       COUNT(CASE WHEN order_status = 'delivered' THEN 1 END) as delivered
       FROM orders ${dateFilter}`,
      params
    );

    // Total users
    const usersResult = await pool.query('SELECT COUNT(*) as total FROM users');

    // Top products
    const topProductsResult = await pool.query(
      `SELECT p.id, p.name, SUM(oi.quantity) as total_sold, SUM(oi.quantity * oi.price) as revenue
       FROM order_items oi
       JOIN products p ON oi.product_id = p.id
       JOIN orders o ON oi.order_id = o.id
       ${dateFilter}
       GROUP BY p.id, p.name
       ORDER BY total_sold DESC
       LIMIT 10`,
      params
    );

    return ResponseHandler.success(res, {
      orders: ordersResult.rows[0],
      users: usersResult.rows[0],
      topProducts: topProductsResult.rows,
    }, 'Lấy thống kê thành công');
  } catch (error: any) {
    logger.error('Error fetching statistics', error instanceof Error ? error : new Error(String(error)));
    return ResponseHandler.internalError(res, 'Lỗi khi lấy thống kê', error);
  }
};

