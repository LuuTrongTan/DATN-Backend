import { Response } from 'express';
import bcrypt from 'bcryptjs';
import { AuthRequest } from '../../middlewares/auth.middleware';
import { pool } from '../../connections';

// UC-18, UC-19, UC-20: Quản lý danh mục
export const createCategory = async (req: AuthRequest, res: Response) => {
  try {
    const { name, image_url, description } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'Tên danh mục không được để trống' });
    }

    const result = await pool.query(
      `INSERT INTO categories (name, image_url, description)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [name, image_url || null, description || null]
    );

    res.status(201).json({
      message: 'Thêm danh mục thành công',
      category: result.rows[0],
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const updateCategory = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, image_url, description } = req.body;

    const result = await pool.query(
      `UPDATE categories 
       SET name = COALESCE($1, name),
           image_url = COALESCE($2, image_url),
           description = COALESCE($3, description),
           updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [name, image_url, description, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Danh mục không tồn tại' });
    }

    res.json({
      message: 'Cập nhật danh mục thành công',
      category: result.rows[0],
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteCategory = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const result = await pool.query('DELETE FROM categories WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Danh mục không tồn tại' });
    }

    res.json({ message: 'Xóa danh mục thành công' });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// UC-21: Xử lý đơn hàng
export const updateOrderStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    const validStatuses = ['pending', 'confirmed', 'processing', 'shipping', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Trạng thái đơn hàng không hợp lệ' });
    }

    // Update order
    const orderResult = await pool.query(
      `UPDATE orders 
       SET order_status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [status, id]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ message: 'Đơn hàng không tồn tại' });
    }

    // Add to status history
    await pool.query(
      `INSERT INTO order_status_history (order_id, status, notes, updated_by)
       VALUES ($1, $2, $3, $4)`,
      [id, status, notes || null, req.user!.id]
    );

    res.json({
      message: 'Cập nhật trạng thái đơn hàng thành công',
      order: orderResult.rows[0],
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getAllOrders = async (req: AuthRequest, res: Response) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;

    let query = 'SELECT * FROM orders WHERE 1=1';
    const params: any[] = [];
    let paramCount = 0;

    if (status) {
      paramCount++;
      query += ` AND order_status = $${paramCount}`;
      params.push(status);
    }

    paramCount++;
    query += ` ORDER BY created_at DESC LIMIT $${paramCount}`;
    params.push(limit);

    paramCount++;
    query += ` OFFSET $${paramCount}`;
    params.push((page - 1) * limit);

    const result = await pool.query(query, params);

    res.json({ orders: result.rows });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// UC-22: Tạo staff
export const createStaff = async (req: AuthRequest, res: Response) => {
  try {
    const { email, phone } = req.body;

    if (!email && !phone) {
      return res.status(400).json({ message: 'Phải cung cấp email hoặc số điện thoại' });
    }

    if (email && !email.includes('@')) {
      return res.status(400).json({ message: 'Email không hợp lệ' });
    }

    if (phone && phone.length !== 11) {
      return res.status(400).json({ message: 'Số điện thoại phải có 11 chữ số' });
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
        return res.json({ message: 'Đã cập nhật role thành staff' });
      } else {
        return res.status(400).json({ message: 'Tài khoản đã là staff hoặc admin' });
      }
    }

    // Create new staff account with default password
    const defaultPassword = 'Staff@123';
    const passwordHash = await bcrypt.hash(defaultPassword, 10);

    const result = await pool.query(
      `INSERT INTO users (email, phone, password_hash, role, is_verified)
       VALUES ($1, $2, $3, 'staff', TRUE)
       RETURNING id, email, phone, role`,
      [email || null, phone || null, passwordHash]
    );

    res.status(201).json({
      message: 'Tạo tài khoản staff thành công',
      staff: result.rows[0],
      defaultPassword,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// UC-23: Quản lý staff/user
export const getUsers = async (req: AuthRequest, res: Response) => {
  try {
    const { role, page = 1, limit = 20 } = req.query;

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
    params.push(limit);

    paramCount++;
    query += ` OFFSET $${paramCount}`;
    params.push((page - 1) * limit);

    const result = await pool.query(query, params);

    res.json({ users: result.rows });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const updateUser = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { is_active, is_banned, role, email, password } = req.body;

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
      return res.status(400).json({ message: 'Không có trường nào để cập nhật' });
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
      return res.status(404).json({ message: 'Người dùng không tồn tại' });
    }

    res.json({
      message: 'Cập nhật người dùng thành công',
      user: result.rows[0],
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
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

    res.json({
      statistics: {
        orders: ordersResult.rows[0],
        users: usersResult.rows[0],
        topProducts: topProductsResult.rows,
      },
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

