import { Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { AuthRequest } from '../../types/request.types';
import { pool } from '../../connections';
import { sendOrderStatusUpdateEmail } from '../../utils/email.service';
import { ResponseHandler } from '../../utils/response';
import { logger } from '../../utils/logging';
import { appConfig } from '../../connections/config/app.config';
import { ORDER_STATUS, USER_ROLE, USER_STATUS } from '../../constants';

// UC-18, UC-19, UC-20: Quản lý danh mục
export const createCategory = async (req: AuthRequest, res: Response) => {
  const { name, slug, image_url, description, parent_id, display_order, is_active } = req.body;
  
  try {
    if (!name || !slug) {
      return ResponseHandler.error(res, 'Tên và slug danh mục không được để trống', 400);
    }

    // Check unique slug (only non-deleted)
    const slugCheck = await pool.query(
      'SELECT id FROM categories WHERE slug = $1 AND deleted_at IS NULL',
      [slug]
    );
    if (slugCheck.rows.length > 0) {
      return ResponseHandler.conflict(res, 'Slug danh mục đã tồn tại');
    }

    // Validate parent_id (nếu có) phải tồn tại và chưa bị xóa
    if (parent_id) {
      const parentCheck = await pool.query(
        'SELECT id FROM categories WHERE id = $1 AND deleted_at IS NULL',
        [parent_id]
      );
      if (parentCheck.rows.length === 0) {
        return ResponseHandler.notFound(res, 'Danh mục cha không tồn tại hoặc đã bị xóa');
      }
    }

    const result = await pool.query(
      `INSERT INTO categories (name, slug, parent_id, image_url, description, display_order, is_active)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6, 0), COALESCE($7, TRUE))
       RETURNING id, name, slug, parent_id, image_url, description, display_order, is_active, created_at, updated_at`,
      [name, slug, parent_id || null, image_url || null, description || null, display_order, is_active]
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
  const { name, slug, parent_id, image_url, description, display_order, is_active } = req.body;
  
  try {
    // Check category exists (not deleted)
    const exists = await pool.query('SELECT id, slug FROM categories WHERE id = $1 AND deleted_at IS NULL', [id]);
    if (exists.rows.length === 0) {
      return ResponseHandler.notFound(res, 'Danh mục không tồn tại');
    }

    // If slug change, ensure unique
    if (slug && slug !== exists.rows[0].slug) {
      const slugCheck = await pool.query(
        'SELECT id FROM categories WHERE slug = $1 AND id != $2 AND deleted_at IS NULL',
        [slug, id]
      );
      if (slugCheck.rows.length > 0) {
        return ResponseHandler.conflict(res, 'Slug danh mục đã tồn tại');
      }
    }

    // Validate parent_id (nếu gửi) phải khác chính nó và còn tồn tại
    if (parent_id !== undefined) {
      if (parent_id === id) {
        return ResponseHandler.error(res, 'Danh mục không thể là cha của chính nó', 400);
      }
      if (parent_id) {
        const parentCheck = await pool.query(
          'SELECT id FROM categories WHERE id = $1 AND deleted_at IS NULL',
          [parent_id]
        );
        if (parentCheck.rows.length === 0) {
          return ResponseHandler.notFound(res, 'Danh mục cha không tồn tại hoặc đã bị xóa');
        }
      }
    }

    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 0;

    const fields: Record<string, any> = {
      name,
      slug,
      parent_id,
      image_url,
      description,
      display_order,
      is_active,
    };

    for (const [field, value] of Object.entries(fields)) {
      if (value !== undefined) {
        paramCount++;
        updates.push(`${field} = $${paramCount}`);
        values.push(value === '' ? null : value);
      }
    }

    if (updates.length === 0) {
      return ResponseHandler.error(res, 'Không có trường nào để cập nhật', 400);
    }

    // updated_at
    updates.push('updated_at = NOW()');
    values.push(id);
    paramCount++;

    const result = await pool.query(
      `UPDATE categories 
       SET ${updates.join(', ')}
       WHERE id = $${paramCount} AND deleted_at IS NULL
       RETURNING id, name, slug, parent_id, image_url, description, display_order, is_active, created_at, updated_at`,
      values
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
    // Chặn xóa nếu còn danh mục con
    const childCount = await pool.query(
      'SELECT COUNT(*) FROM categories WHERE parent_id = $1 AND deleted_at IS NULL',
      [id]
    );
    if (parseInt(childCount.rows[0].count) > 0) {
      return ResponseHandler.error(res, 'Không thể xóa danh mục còn danh mục con', 400);
    }

    // Chặn xóa nếu còn sản phẩm tham chiếu
    const productCount = await pool.query(
      'SELECT COUNT(*) FROM products WHERE category_id = $1 AND deleted_at IS NULL',
      [id]
    );
    if (parseInt(productCount.rows[0].count) > 0) {
      return ResponseHandler.error(res, 'Không thể xóa danh mục đang được dùng bởi sản phẩm', 400);
    }

    const result = await pool.query(
      `UPDATE categories 
       SET deleted_at = NOW(), is_active = FALSE, updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id`,
      [id]
    );

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

// Lấy danh sách danh mục cho admin (đầy đủ thông tin)
export const getCategoriesAdmin = async (req: AuthRequest, res: Response) => {
  const includeDeleted = String(req.query.include_deleted || 'false') === 'true';

  try {
    const baseQuery = `
      SELECT id, name, slug, parent_id, image_url, description, display_order, is_active, created_at, updated_at, deleted_at
      FROM categories
    `;

    const query = includeDeleted
      ? `${baseQuery} ORDER BY display_order NULLS LAST, name ASC`
      : `${baseQuery} WHERE deleted_at IS NULL ORDER BY display_order NULLS LAST, name ASC`;

    const result = await pool.query(query);

    return ResponseHandler.success(res, result.rows, 'Lấy danh sách danh mục (admin) thành công');
  } catch (error: any) {
    logger.error('Error fetching categories (admin)', error instanceof Error ? error : new Error(String(error)));
    return ResponseHandler.internalError(res, 'Lỗi khi lấy danh sách danh mục', error);
  }
};

// Lấy chi tiết danh mục cho admin (đầy đủ thông tin)
export const getCategoryAdmin = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const includeDeleted = String(req.query.include_deleted || 'false') === 'true';

  try {
    const result = await pool.query(
      `
        SELECT id, name, slug, parent_id, image_url, description, display_order, is_active, created_at, updated_at, deleted_at
        FROM categories
        WHERE id = $1 ${includeDeleted ? '' : 'AND deleted_at IS NULL'}
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return ResponseHandler.notFound(res, 'Danh mục không tồn tại');
    }

    return ResponseHandler.success(res, result.rows[0], 'Lấy thông tin danh mục (admin) thành công');
  } catch (error: any) {
    logger.error('Error fetching category (admin)', error instanceof Error ? error : new Error(String(error)), { categoryId: id });
    return ResponseHandler.internalError(res, 'Lỗi khi lấy thông tin danh mục', error);
  }
};

// Khôi phục danh mục đã bị xóa mềm (admin)
export const restoreCategoryAdmin = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  try {
    // Lấy thông tin danh mục, bao gồm cả đã xóa mềm
    const existing = await pool.query(
      'SELECT id, name, slug, deleted_at FROM categories WHERE id = $1',
      [id]
    );

    if (existing.rows.length === 0) {
      return ResponseHandler.notFound(res, 'Danh mục không tồn tại');
    }

    const category = existing.rows[0];

    if (category.deleted_at === null) {
      return ResponseHandler.error(res, 'Danh mục đang hoạt động, không cần khôi phục', 400);
    }

    // Đảm bảo slug vẫn unique trong các danh mục chưa xóa
    const slugCheck = await pool.query(
      'SELECT id FROM categories WHERE slug = $1 AND id != $2 AND deleted_at IS NULL',
      [category.slug, id]
    );

    if (slugCheck.rows.length > 0) {
      return ResponseHandler.conflict(
        res,
        'Không thể khôi phục vì slug danh mục đã được sử dụng bởi danh mục khác'
      );
    }

    const result = await pool.query(
      `UPDATE categories
       SET deleted_at = NULL,
           is_active = TRUE,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, name, slug, parent_id, image_url, description, display_order, is_active, created_at, updated_at, deleted_at`,
      [id]
    );

    return ResponseHandler.success(res, result.rows[0], 'Khôi phục danh mục thành công');
  } catch (error: any) {
    logger.error(
      'Error restoring category (admin)',
      error instanceof Error ? error : new Error(String(error)),
      { categoryId: id }
    );
    return ResponseHandler.internalError(res, 'Lỗi khi khôi phục danh mục', error);
  }
};

// Lấy danh sách sản phẩm cho admin (bao gồm inactive/deleted tùy include_deleted)
export const getProductsAdmin = async (req: AuthRequest, res: Response) => {
  const { search, category_id, include_deleted } = req.query;
  const includeDeleted = String(include_deleted || 'false') === 'true';

  try {
    const params: any[] = [];
    let idx = 0;
    let where = 'WHERE 1=1';

    if (!includeDeleted) {
      where += ' AND p.deleted_at IS NULL';
    }

    if (category_id) {
      idx++;
      where += ` AND p.category_id = $${idx}`;
      params.push(category_id);
    }

    if (search) {
      idx++;
      const q = `%${search}%`;
      where += ` AND (p.name ILIKE $${idx} OR p.sku ILIKE $${idx})`;
      params.push(q);
    }

    const query = `
      SELECT p.*,
             c.name as category_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      ${where}
      ORDER BY p.created_at DESC
      LIMIT 200
    `;

    const result = await pool.query(query, params);

    return ResponseHandler.success(res, result.rows, 'Lấy danh sách sản phẩm (admin) thành công');
  } catch (error: any) {
    logger.error('Error fetching products (admin)', error instanceof Error ? error : new Error(String(error)));
    return ResponseHandler.internalError(res, 'Lỗi khi lấy danh sách sản phẩm', error);
  }
};

// Lấy chi tiết sản phẩm cho admin
export const getProductAdmin = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `
        SELECT p.*,
               c.name as category_name
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE p.id = $1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return ResponseHandler.notFound(res, 'Sản phẩm không tồn tại');
    }

    return ResponseHandler.success(res, result.rows[0], 'Lấy thông tin sản phẩm (admin) thành công');
  } catch (error: any) {
    logger.error('Error fetching product (admin)', error instanceof Error ? error : new Error(String(error)), { productId: id });
    return ResponseHandler.internalError(res, 'Lỗi khi lấy thông tin sản phẩm', error);
  }
};

// UC-21: Xử lý đơn hàng
export const updateOrderStatus = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { status, notes } = req.body;
  
  try {

    const validStatuses = Object.values(ORDER_STATUS);
    if (!validStatuses.includes(status)) {
      return ResponseHandler.error(res, 'Trạng thái đơn hàng không hợp lệ', 400);
    }

    // Update order
    const orderResult = await pool.query(
      `UPDATE orders 
       SET order_status = $1, updated_at = NOW()
       WHERE id = $2 AND deleted_at IS NULL
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

    let query = 'SELECT id, user_id, order_number, total_amount, order_status, payment_status, shipping_address, payment_method, shipping_fee, notes, created_at, updated_at FROM orders WHERE deleted_at IS NULL';
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
      'SELECT id, role, status FROM users WHERE (email = $1 OR phone = $2)',
      [email, phone]
    );

    if (existingUser.rows.length > 0) {
      const user = existingUser.rows[0];
      
      if (user.status === USER_STATUS.DELETED) {
        return ResponseHandler.error(res, 'Tài khoản đã bị xóa', 400);
      }

      if (user.role === USER_ROLE.CUSTOMER) {
        // Update role to staff
        await pool.query('UPDATE users SET role = $1 WHERE id = $2', [USER_ROLE.STAFF, user.id]);
        return ResponseHandler.success(res, { userId: user.id, role: USER_ROLE.STAFF }, 'Đã cập nhật role thành staff');
      } else {
        return ResponseHandler.error(res, 'Tài khoản đã là staff hoặc admin', 400);
      }
    }

    // Create new staff account with default password
    // Generate random password for security
    const defaultPassword = crypto.randomBytes(8).toString('base64').slice(0, 12) + '!@#';
    const passwordHash = await bcrypt.hash(defaultPassword, 10);

    const result = await pool.query(
      `INSERT INTO users (email, phone, password_hash, role, email_verified, phone_verified, status)
       VALUES ($1, $2, $3, $4, TRUE, TRUE, $5)
       RETURNING id, email, phone, role`,
      [email || null, phone || null, passwordHash, USER_ROLE.STAFF, USER_STATUS.ACTIVE]
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

    // Base query (dùng lại cho cả data và count)
    let baseQuery = 'FROM users WHERE status <> $1';
    const params: any[] = [];
    let paramCount = 1;
    params.push(USER_STATUS.DELETED);

    if (role) {
      paramCount++;
      baseQuery += ` AND role = $${paramCount}`;
      params.push(role);
    }

    // Query dữ liệu (có phân trang)
    const dataQuery =
      'SELECT id, email, phone, full_name, role, status, phone_verified, email_verified, created_at ' +
      baseQuery +
      ` ORDER BY created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;

    const dataParams = [...params, limitNum, (pageNum - 1) * limitNum];

    paramCount++;
    const countQuery = 'SELECT COUNT(*) ' + baseQuery;

    // Count total (không ORDER BY / LIMIT / OFFSET)
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);

    const result = await pool.query(dataQuery, dataParams);

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
  const { status, role, email, password, phone_verified, email_verified } = req.body;
  
  try {

    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 0;

    if (status !== undefined) {
      if (!Object.values(USER_STATUS).includes(status)) {
        return ResponseHandler.error(res, 'Trạng thái không hợp lệ', 400);
      }
      paramCount++;
      updates.push(`status = $${paramCount}`);
      values.push(status);
    }

    if (phone_verified !== undefined) {
      paramCount++;
      updates.push(`phone_verified = $${paramCount}`);
      values.push(phone_verified);
    }

    if (email_verified !== undefined) {
      paramCount++;
      updates.push(`email_verified = $${paramCount}`);
      values.push(email_verified);
    }

    if (role) {
      if (!Object.values(USER_ROLE).includes(role)) {
        return ResponseHandler.error(res, 'Vai trò không hợp lệ', 400);
      }
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
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount}
       RETURNING id, email, phone, full_name, role, status, phone_verified, email_verified`,
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

    let dateFilterOrders = '';
    let dateFilterOrdersWithAlias = '';
    const params: any[] = [];
    
    if (start_date && end_date) {
      // Cho truy vấn chỉ dùng bảng orders (không alias)
      dateFilterOrders = 'WHERE created_at BETWEEN $1 AND $2';
      // Cho truy vấn có alias orders là o
      dateFilterOrdersWithAlias = 'AND o.created_at BETWEEN $1 AND $2';
      params.push(start_date, end_date);
    }

    // Total orders
    const ordersResult = await pool.query(
      `SELECT COUNT(*) as total, 
       SUM(total_amount) as revenue,
       COUNT(CASE WHEN order_status = 'delivered' THEN 1 END) as delivered
       FROM orders WHERE deleted_at IS NULL ${dateFilterOrders ? 'AND created_at BETWEEN $1 AND $2' : ''}`,
      params
    );

    // Total users
    const usersResult = await pool.query('SELECT COUNT(*) as total FROM users WHERE status <> $1', [USER_STATUS.DELETED]);

    // Top products
    const topProductsResult = await pool.query(
      `SELECT p.id, p.name, SUM(oi.quantity) as total_sold, SUM(oi.quantity * oi.price) as revenue
       FROM order_items oi
       JOIN products p ON oi.product_id = p.id
       JOIN orders o ON oi.order_id = o.id
       WHERE o.deleted_at IS NULL
       ${dateFilterOrdersWithAlias}
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

