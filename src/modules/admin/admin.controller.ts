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
import { createNotification } from '../notifications/notifications.controller';
import { createShippingOrder } from '../shipping/shipping.service';

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

// Khôi phục sản phẩm đã bị xóa mềm (admin)
export const restoreProductAdmin = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  try {
    // Lấy thông tin sản phẩm, bao gồm cả đã xóa mềm
    const existing = await pool.query(
      'SELECT id, name, sku, deleted_at FROM products WHERE id = $1',
      [id]
    );

    if (existing.rows.length === 0) {
      return ResponseHandler.notFound(res, 'Sản phẩm không tồn tại');
    }

    const product = existing.rows[0];

    if (product.deleted_at === null) {
      return ResponseHandler.error(res, 'Sản phẩm đang hoạt động, không cần khôi phục', 400);
    }

    // Đảm bảo SKU vẫn unique trong các sản phẩm chưa xóa (nếu có SKU)
    if (product.sku) {
      const skuCheck = await pool.query(
        'SELECT id FROM products WHERE sku = $1 AND id != $2 AND deleted_at IS NULL',
        [product.sku, id]
      );

      if (skuCheck.rows.length > 0) {
        return ResponseHandler.conflict(
          res,
          'Không thể khôi phục vì SKU đã được sử dụng bởi sản phẩm khác'
        );
      }
    }

    // Khôi phục sản phẩm
    const result = await pool.query(
      `UPDATE products
       SET deleted_at = NULL,
           is_active = TRUE,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, category_id, sku, name, description, price, stock_quantity, brand, view_count, sold_count, is_active, created_at, updated_at, deleted_at`,
      [id]
    );

    // Khôi phục các variants của sản phẩm
    await pool.query(
      `UPDATE product_variants 
       SET deleted_at = NULL, updated_at = NOW()
       WHERE product_id = $1 AND deleted_at IS NOT NULL`,
      [id]
    );

    return ResponseHandler.success(res, result.rows[0], 'Khôi phục sản phẩm thành công');
  } catch (error: any) {
    logger.error(
      'Error restoring product (admin)',
      error instanceof Error ? error : new Error(String(error)),
      { productId: id }
    );
    return ResponseHandler.internalError(res, 'Lỗi khi khôi phục sản phẩm', error);
  }
};

// Lấy danh sách sản phẩm cho admin (bao gồm inactive/deleted tùy include_deleted)
export const getProductsAdmin = async (req: AuthRequest, res: Response) => {
  const { search, category_id, include_deleted, limit } = req.query;
  const includeDeleted = String(include_deleted || 'false') === 'true';
  const limitNum = limit ? parseInt(String(limit)) : 200;
  const finalLimit = limitNum > 0 && limitNum <= 1000 ? limitNum : 200;

  try {
    const params: any[] = [];
    let idx = 0;
    let where = 'WHERE 1=1';
    let cte = '';

    // Nếu include_deleted = true, chỉ lấy products đã xóa
    // Nếu include_deleted = false, chỉ lấy products chưa xóa
    if (includeDeleted) {
      where += ' AND p.deleted_at IS NOT NULL';
    } else {
      where += ' AND p.deleted_at IS NULL';
    }

    // Lọc theo danh mục bao gồm cả danh mục con
    if (category_id) {
      idx++;
      const catParamIndex = idx;
      params.push(category_id);

      cte = `
        WITH RECURSIVE category_tree AS (
          SELECT id
          FROM categories
          WHERE id = $${catParamIndex}
          UNION ALL
          SELECT c.id
          FROM categories c
          INNER JOIN category_tree ct ON c.parent_id = ct.id
          WHERE c.deleted_at IS NULL
        )
      `;

      where += ` AND p.category_id IN (SELECT id FROM category_tree)`;
    }

    if (search) {
      idx++;
      const q = `%${search}%`;
      where += ` AND (p.name ILIKE $${idx} OR p.sku ILIKE $${idx})`;
      params.push(q);
    }

    idx++;
    params.push(finalLimit);

      const query = `
      ${cte}
      SELECT p.*,
             c.name as category_name,
             -- Tất cả ảnh từ product_media (chỉ product images, không phải variant images)
             (SELECT COALESCE(array_agg(pm.image_url ORDER BY pm.display_order, pm.id), ARRAY[]::text[])
              FROM product_media pm
              WHERE pm.product_id = p.id AND pm.type = 'image') AS image_urls,
             -- Video đầu tiên
             (SELECT pm.image_url
              FROM product_media pm
              WHERE pm.product_id = p.id AND pm.type = 'video'
              ORDER BY pm.display_order, pm.id
              LIMIT 1) AS video_url,
             -- Variants với images
             (SELECT COALESCE(json_agg(variant_data), '[]'::json)
              FROM (
                SELECT json_build_object(
                  'id', pv.id,
                  'product_id', pv.product_id,
                  'variant_attributes', pv.variant_attributes,
                  'price_adjustment', pv.price_adjustment,
                  'stock_quantity', pv.stock_quantity,
                  'created_at', pv.created_at,
                  'image_url', pv.image_url
                ) as variant_data
                FROM product_variants pv
                WHERE pv.product_id = p.id AND pv.deleted_at IS NULL
                ORDER BY pv.id
              ) subq
             ) AS variants
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      ${where}
      ORDER BY p.created_at DESC
      LIMIT $${idx}
    `;

    const result = await pool.query(query, params);

    logger.info('Admin products fetched', {
      count: result.rows.length,
      filters: { search, category_id, include_deleted, limit: finalLimit },
    });

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
               c.name as category_name,
               -- Tất cả ảnh từ product_media
               (SELECT COALESCE(array_agg(pm.image_url ORDER BY pm.display_order, pm.id), ARRAY[]::text[])
                FROM product_media pm
                WHERE pm.product_id = p.id AND pm.type = 'image') AS image_urls,
               -- Video đầu tiên
               (SELECT pm.image_url
                FROM product_media pm
                WHERE pm.product_id = p.id AND pm.type = 'video'
                ORDER BY pm.display_order, pm.id
                LIMIT 1) AS video_url
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
    // Parse order ID
    const orderId = parseInt(id, 10);
    if (isNaN(orderId)) {
      return ResponseHandler.error(res, 'ID đơn hàng không hợp lệ', 400);
    }

    logger.info('Updating order status', { orderId, status, userId: req.user?.id });

    const validStatuses = Object.values(ORDER_STATUS);
    logger.info('Valid order statuses:', { validStatuses, receivedStatus: status });
    
    if (!validStatuses.includes(status)) {
      logger.warn('Invalid order status received', { 
        receivedStatus: status, 
        validStatuses,
        orderId 
      });
      return ResponseHandler.error(
        res, 
        `Trạng thái đơn hàng không hợp lệ. Các trạng thái hợp lệ: ${validStatuses.join(', ')}`, 
        400
      );
    }

    // Check if order exists first
    const checkOrder = await pool.query(
      `SELECT id, deleted_at FROM orders WHERE id = $1`,
      [orderId]
    );

    if (checkOrder.rows.length === 0) {
      logger.warn('Order not found', { orderId });
      return ResponseHandler.notFound(res, 'Đơn hàng không tồn tại');
    }

    if (checkOrder.rows[0].deleted_at) {
      logger.warn('Order is soft-deleted', { orderId });
      return ResponseHandler.error(res, 'Đơn hàng đã bị xóa', 400);
    }

    // Update order và lấy thông tin user (phone) để tạo đơn GHN
    // Khi chuyển sang DELIVERED, tự động cập nhật payment_status = PAID nếu chưa thanh toán
    const orderResult = await pool.query(
      `UPDATE orders 
       SET order_status = $1, 
           payment_status = CASE 
             WHEN $1 = 'delivered' AND payment_status != 'paid' THEN 'paid'
             ELSE payment_status
           END,
           updated_at = NOW()
       WHERE id = $2 AND deleted_at IS NULL
       RETURNING id, user_id, order_number, total_amount, order_status, payment_status, shipping_address, payment_method, shipping_fee, notes, created_at, updated_at`,
      [status, orderId]
    );

    if (orderResult.rows.length === 0) {
      logger.warn('Order update returned no rows', { orderId, status });
      return ResponseHandler.notFound(res, 'Đơn hàng không tồn tại hoặc đã bị xóa');
    }

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
          orderId,
          orderNumber: order.order_number,
          email: userResult.rows[0].email,
        });
      }
    }

    // Khi shop chuyển đơn hàng sang trạng thái SHIPPING, tự động tạo đơn GHN
    if (status === ORDER_STATUS.SHIPPING && order.shipping_address) {
      try {
        // Kiểm tra xem đã có tracking_number chưa để tránh gọi lại
        const shippingCheck = await pool.query(
          'SELECT tracking_number FROM shipping WHERE order_id = $1',
          [orderId]
        );

        // Chỉ tạo đơn GHN nếu chưa có tracking_number
        if (!shippingCheck.rows[0]?.tracking_number) {
          logger.info('Creating GHN order for confirmed order', { orderId, orderNumber: order.order_number, status });

          // Lấy thông tin user (phone, full_name) để tạo đơn GHN
          const userResult = await pool.query(
            'SELECT phone, full_name FROM users WHERE id = $1',
            [order.user_id]
          );
          const user = userResult.rows[0] || {};

          // Lấy thông tin địa chỉ chi tiết từ user_addresses
          // Có 2 cách: 
          // 1. Nếu có shipping_address_id trong orders (nếu đã có migration)
          // 2. Nếu không, tìm trong user_addresses dựa trên user_id và địa chỉ string
          let addressInfo: any = {};
          try {
            // Cách 1: Kiểm tra xem có shipping_address_id trong order không
            let shippingAddressId: number | null = null;
            try {
              const checkAddressId = await pool.query(
                `SELECT shipping_address_id FROM orders WHERE id = $1 LIMIT 1`,
                [orderId]
              );
              shippingAddressId = checkAddressId.rows[0]?.shipping_address_id;
            } catch (error: any) {
              // Cột shipping_address_id chưa tồn tại, bỏ qua
              logger.debug('shipping_address_id column may not exist yet', {
                orderId,
                error: error.message,
              });
            }

            // Cách 2: Nếu không có shipping_address_id, tìm trong user_addresses dựa trên địa chỉ string
            if (!shippingAddressId) {
              // Parse địa chỉ để tìm match
              const addressString = order.shipping_address || '';
              // Tìm địa chỉ có street_address khớp với shipping_address
              const addressResult = await pool.query(
                `SELECT id, province, district, ward, province_code, district_code, ward_code, street_address
                 FROM user_addresses
                 WHERE user_id = $1 
                   AND deleted_at IS NULL
                   AND (street_address = $2 OR street_address LIKE $3 OR $2 LIKE CONCAT('%', street_address, '%'))
                 ORDER BY 
                   CASE WHEN street_address = $2 THEN 1 
                        WHEN street_address LIKE $3 THEN 2
                        ELSE 3 END
                 LIMIT 1`,
                [order.user_id, addressString, `%${addressString}%`]
              );
              
              if (addressResult.rows.length > 0) {
                shippingAddressId = addressResult.rows[0].id;
                logger.info('Found matching address in user_addresses by string match', {
                  orderId,
                  addressId: shippingAddressId,
                });
              }
            }

            // Lấy thông tin chi tiết từ user_addresses nếu có ID
            if (shippingAddressId) {
              const addressResult = await pool.query(
                `SELECT province, district, ward, province_code, district_code, ward_code, street_address
                 FROM user_addresses
                 WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
                [shippingAddressId, order.user_id]
              );
              if (addressResult.rows.length > 0) {
                const addr = addressResult.rows[0];
                addressInfo = {
                  province: addr.province,
                  district: addr.district,
                  ward: addr.ward,
                  province_id: addr.province_code, // GHN dùng province_code
                  district_id: addr.district_code, // GHN dùng district_code
                  ward_code: addr.ward_code,
                  address: addr.street_address,
                };
                logger.info('Found address info from user_addresses', {
                  orderId,
                  addressId: shippingAddressId,
                  province: addr.province,
                  district: addr.district,
                  ward: addr.ward,
                  province_id: addr.province_code,
                  district_id: addr.district_code,
                  ward_code: addr.ward_code,
                });
              }
            }
          } catch (error: any) {
            logger.warn('Error getting address info from user_addresses', {
              orderId,
              error: error.message,
            });
          }

          // Parse shipping_address (có thể là JSON string hoặc object)
          let shippingAddress: any = {};
          try {
            shippingAddress = typeof order.shipping_address === 'string' 
              ? JSON.parse(order.shipping_address) 
              : order.shipping_address;
          } catch {
            // Nếu không parse được, coi như string đơn giản
            shippingAddress = { address: order.shipping_address };
          }

          // Merge thông tin: ưu tiên từ user_addresses, sau đó từ shipping_address JSON, cuối cùng là user
          const finalAddress = {
            // Name và phone: ưu tiên từ user
            name: user.full_name || shippingAddress.name || shippingAddress.full_name || shippingAddress.to_name || 'Khách hàng',
            phone: user.phone || shippingAddress.phone || shippingAddress.phone_number || shippingAddress.to_phone || '',
            // Địa chỉ: ưu tiên từ user_addresses, sau đó từ shipping_address
            address: addressInfo.address || shippingAddress.address || shippingAddress.street || shippingAddress.to_address || order.shipping_address || '',
            province: addressInfo.province || shippingAddress.province || shippingAddress.province_name || '',
            district: addressInfo.district || shippingAddress.district || shippingAddress.district_name || '',
            ward: addressInfo.ward || shippingAddress.ward || shippingAddress.ward_name || '',
            province_id: addressInfo.province_id || shippingAddress.province_id || shippingAddress.province_code || null,
            district_id: addressInfo.district_id || shippingAddress.district_id || shippingAddress.district_code || null,
            ward_code: addressInfo.ward_code || shippingAddress.ward_code || shippingAddress.wardCode || '',
          };

          // Lấy thông tin order items để tính weight
          // Lưu ý: Database không có trường weight cho products/variants,
          // nên sử dụng giá trị mặc định 0.5kg/item (500g/item)
          const itemsResult = await pool.query(
            `SELECT oi.id, oi.quantity, oi.product_id, oi.variant_id
             FROM order_items oi
             WHERE oi.order_id = $1`,
            [orderId]
          );

          if (!itemsResult.rows || itemsResult.rows.length === 0) {
            logger.warn('Cannot create GHN order: order has no items', {
              orderId,
              orderNumber: order.order_number,
            });
            throw new Error('Đơn hàng không có sản phẩm nào');
          }

          // Tính tổng weight (đơn vị: kg)
          // Logic: Mỗi item có weight mặc định 0.5kg (500g)
          // Tổng weight = số lượng items × 0.5kg
          // GHN API yêu cầu weight tính bằng gram, sẽ được convert trong shipping.service.ts
          const DEFAULT_WEIGHT_PER_ITEM_KG = 0.5; // 0.5kg = 500g per item
          const MIN_WEIGHT_KG = 0.5; // Tối thiểu 0.5kg cho đơn hàng

          let totalWeightKg = 0;
          let totalItemsCount = 0;

          for (const item of itemsResult.rows) {
            const itemQuantity = parseInt(item.quantity, 10) || 1;
            const itemWeight = DEFAULT_WEIGHT_PER_ITEM_KG * itemQuantity;
            totalWeightKg += itemWeight;
            totalItemsCount += itemQuantity;
          }

          // Đảm bảo weight tối thiểu
          if (totalWeightKg < MIN_WEIGHT_KG) {
            totalWeightKg = MIN_WEIGHT_KG;
            logger.info('Weight adjusted to minimum', {
              orderId,
              originalWeight: totalWeightKg,
              adjustedWeight: MIN_WEIGHT_KG,
            });
          }

          logger.info('Calculated order weight for GHN', {
            orderId,
            orderNumber: order.order_number,
            totalItems: totalItemsCount,
            totalWeightKg: totalWeightKg,
            totalWeightGram: totalWeightKg * 1000,
            itemsCount: itemsResult.rows.length,
          });

          // Get shop info from environment - giá trị mặc định cho GHN from_*
          const shopName = process.env.SHOP_NAME || 'TinTest124';
          const shopPhone = process.env.SHOP_PHONE || '0987654321';
          const shopAddress = process.env.SHOP_ADDRESS || '72 Thành Thái, Phường 14, Quận 10, Hồ Chí Minh, Vietnam';
          const shopProvince = process.env.SHOP_PROVINCE || 'HCM';
          const shopDistrict = process.env.SHOP_DISTRICT || 'Quận 10';
          const shopWard = process.env.SHOP_WARD || 'Phường 14';

          // Validate các trường bắt buộc theo tài liệu GHN API
          // Theo https://api.ghn.vn/home/docs/detail?id=122
          const toName = finalAddress.name;
          const toPhone = finalAddress.phone;
          const toAddress = finalAddress.address;
          // Ưu tiên dùng tên (province, district, ward) vì GHN API hỗ trợ cả tên và ID
          const toProvince = finalAddress.province || '';
          const toDistrict = finalAddress.district || '';
          const toWard = finalAddress.ward || '';
          // Lưu ID/code để dùng nếu cần
          const toProvinceId = finalAddress.province_id;
          const toDistrictId = finalAddress.district_id;
          const toWardCode = finalAddress.ward_code;

          // Kiểm tra các trường bắt buộc
          // Theo tài liệu GHN: to_phone, to_address, to_province (hoặc province_id), to_district (hoặc district_id), to_ward (hoặc ward_code) là bắt buộc
          const hasProvince = !!(toProvince || toProvinceId);
          const hasDistrict = !!(toDistrict || toDistrictId);
          const hasWard = !!(toWard || toWardCode);
          
          if (!toPhone || !toAddress || !hasProvince || !hasDistrict || !hasWard) {
            logger.warn('Missing required fields for GHN order creation', {
              orderId,
              orderNumber: order.order_number,
              hasToPhone: !!toPhone,
              hasToAddress: !!toAddress,
              hasToProvince: hasProvince,
              hasToDistrict: hasDistrict,
              hasToWard: hasWard,
              province: toProvince || toProvinceId,
              district: toDistrict || toDistrictId,
              ward: toWard || toWardCode,
              shippingAddress,
              userPhone: user.phone,
              addressInfo,
            });
            
            // Thay vì throw error, log warning và skip tạo đơn GHN
            // Admin có thể tạo đơn GHN thủ công sau khi bổ sung thông tin
            logger.warn('Skipping GHN order creation due to missing required fields. Admin can create GHN order manually later.', {
              orderId,
              orderNumber: order.order_number,
              missingFields: {
                phone: !toPhone,
                address: !toAddress,
                province: !hasProvince,
                district: !hasDistrict,
                ward: !hasWard,
              },
              availableFields: {
                province: toProvince || toProvinceId || 'N/A',
                district: toDistrict || toDistrictId || 'N/A',
                ward: toWard || toWardCode || 'N/A',
              },
            });
            
            // Không throw error, chỉ log warning để không block việc cập nhật trạng thái đơn hàng
            // Skip tạo đơn GHN khi thiếu thông tin
          } else {
            // Chỉ tạo đơn GHN khi có đủ thông tin
            // Tạo đơn GHN
            const shippingResult = await createShippingOrder({
            order_id: orderId,
            order_number: order.order_number,
            from_name: shopName,
            from_phone: shopPhone,
            from_address: shopAddress,
            from_province: shopProvince,
            from_district: shopDistrict,
            from_ward: shopWard,
            to_name: toName,
            to_phone: toPhone,
            to_address: toAddress,
            // Ưu tiên dùng ID/code nếu có (GHN API hỗ trợ cả tên và ID)
            to_province: toProvinceId || toProvince,
            to_district: toDistrictId || toDistrict,
            to_ward: toWardCode || toWard,
            weight: totalWeightKg,
            value: parseFloat(order.total_amount),
            cod: order.payment_method === 'cod' ? parseFloat(order.total_amount) : 0,
            note: order.notes || `Đơn hàng #${order.order_number}`,
          });

          if (shippingResult.success && shippingResult.tracking_number) {
            // Cập nhật tracking_number vào bảng shipping
            await pool.query(
              `UPDATE shipping 
               SET tracking_number = $1, 
                   shipping_provider = 'GHN',
                   status = 'picked_up',
                   updated_at = NOW()
               WHERE order_id = $2`,
              [shippingResult.tracking_number, orderId]
            );

            logger.info('GHN order created successfully', {
              orderId,
              orderNumber: order.order_number,
              trackingNumber: shippingResult.tracking_number,
            });
          } else {
            logger.warn('Failed to create GHN order', {
              orderId,
              orderNumber: order.order_number,
              error: shippingResult.error,
            });
          }
          } // End else block - chỉ tạo đơn GHN khi có đủ thông tin
        } else {
          logger.info('GHN order already exists for this order', {
            orderId,
            trackingNumber: shippingCheck.rows[0].tracking_number,
          });
        }
      } catch (error: any) {
        // Log error but don't fail the request - shop có thể tạo đơn GHN sau
        logger.error('Error creating GHN order when confirming order', error instanceof Error ? error : new Error(String(error)), {
          orderId,
          orderNumber: order.order_number,
          status,
          errorMessage: error.message,
        });
      }
    }

    // Send notification to user based on order status
    try {
      // Log để debug
      logger.info('Preparing to create notification', {
        orderId,
        orderNumber: order.order_number,
        userId: order.user_id,
        userIdType: typeof order.user_id,
        status,
        statusType: typeof status,
        ORDER_STATUS_SHIPPING: ORDER_STATUS.SHIPPING,
        ORDER_STATUS_DELIVERED: ORDER_STATUS.DELIVERED,
        ORDER_STATUS_CANCELLED: ORDER_STATUS.CANCELLED,
      });

      // Validate order.user_id exists và có format hợp lệ
      if (!order.user_id) {
        logger.warn('Cannot create notification: order.user_id is missing', {
          orderId,
          orderNumber: order.order_number,
          status,
          orderData: {
            id: order.id,
            order_number: order.order_number,
            user_id: order.user_id,
          },
        });
      } else {
        // Validate user_id format (UUID)
        const userIdString = String(order.user_id).trim();
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        
        if (!uuidRegex.test(userIdString)) {
          logger.warn('order.user_id does not match UUID format', {
            orderId,
            orderNumber: order.order_number,
            userId: order.user_id,
            userIdString,
            status,
          });
        }

        let notificationType: 'order_shipped' | 'order_delivered' | 'order_cancelled' | null = null;
        let notificationTitle = '';
        let notificationMessage = '';

        // Normalize status để đảm bảo so sánh chính xác
        const statusString = String(status).toLowerCase().trim();
        const shippingStatus = ORDER_STATUS.SHIPPING.toLowerCase();
        const deliveredStatus = ORDER_STATUS.DELIVERED.toLowerCase();
        const cancelledStatus = ORDER_STATUS.CANCELLED.toLowerCase();

        logger.info('Checking order status for notification', {
          orderId,
          status,
          statusString,
          isShipping: statusString === shippingStatus,
          isDelivered: statusString === deliveredStatus,
          isCancelled: statusString === cancelledStatus,
        });

        // So sánh status đã được normalize
        if (statusString === shippingStatus) {
          notificationType = 'order_shipped';
          notificationTitle = 'Đơn hàng đang được vận chuyển';
          notificationMessage = `Đơn hàng ${order.order_number} của bạn đã được xác nhận và đang được vận chuyển.`;
        } else if (statusString === deliveredStatus) {
          notificationType = 'order_delivered';
          notificationTitle = 'Đơn hàng đã được giao';
          notificationMessage = `Đơn hàng ${order.order_number} của bạn đã được giao thành công. Cảm ơn bạn đã mua sắm!`;
        } else if (statusString === cancelledStatus) {
          notificationType = 'order_cancelled';
          notificationTitle = 'Đơn hàng đã bị hủy';
          notificationMessage = `Đơn hàng ${order.order_number} của bạn đã bị hủy.${notes ? ` Lý do: ${notes}` : ''}`;
        } else {
          // For other statuses (PENDING, CONFIRMED, PROCESSING), don't send notification
          logger.info('No notification needed for order status', {
            orderId,
            status,
            statusString,
            orderNumber: order.order_number,
            availableStatuses: Object.values(ORDER_STATUS),
          });
        }

        if (notificationType) {
          logger.info('Creating notification for order status change', {
            orderId,
            orderNumber: order.order_number,
            userId: userIdString,
            userIdType: typeof userIdString,
            status,
            statusString,
            notificationType,
            notificationTitle,
            notificationMessage,
          });
          
          try {
            const notificationResult = await createNotification({
              userId: userIdString,
              type: notificationType,
              title: notificationTitle,
              message: notificationMessage,
              link: `/orders/${order.id}`,
            });
            
            if (notificationResult.success) {
              logger.info('Notification created successfully', {
                orderId,
                orderNumber: order.order_number,
                userId: userIdString,
                status,
                notificationType,
                notificationId: notificationResult.notificationId,
              });
            } else {
              logger.error('Notification creation failed', new Error(notificationResult.error || 'Unknown error'), {
                orderId,
                orderNumber: order.order_number,
                userId: userIdString,
                status,
                notificationType,
                error: notificationResult.error,
              });
            }
          } catch (notifError: any) {
            // Log lỗi riêng cho việc tạo notification
            logger.error('Error in createNotification call', notifError instanceof Error ? notifError : new Error(String(notifError)), {
              orderId,
              orderNumber: order.order_number,
              userId: userIdString,
              status,
              notificationType,
              errorMessage: notifError.message,
              errorStack: notifError.stack,
            });
            // Không throw error để không block việc cập nhật trạng thái đơn hàng
          }
        } else {
          logger.info('No notification type determined, skipping notification creation', {
            orderId,
            status,
            statusString,
          });
        }
      }
    } catch (error: any) {
      // Log error but don't fail the request
      logger.error('Failed to create order status notification', error instanceof Error ? error : new Error(String(error)), {
        orderId,
        orderNumber: order.order_number,
        userId: order.user_id,
        status,
        errorMessage: error.message,
        errorStack: error.stack,
      });
    }

    logger.info('Order status updated successfully', { orderId, status });
    return ResponseHandler.success(res, { order: orderResult.rows[0] }, 'Cập nhật trạng thái đơn hàng thành công');
  } catch (error: any) {
    logger.error('Error updating order status', error instanceof Error ? error : new Error(String(error)), {
      orderId: id,
      status,
      ip: req.ip,
      errorMessage: error.message,
      errorStack: error.stack,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi cập nhật trạng thái đơn hàng', error);
  }
};

export const getAllOrders = async (req: AuthRequest, res: Response) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 20;

    let query =
      'SELECT o.id, o.user_id, o.order_number, o.total_amount, o.order_status, o.payment_status, o.shipping_address, o.payment_method, o.shipping_fee, o.notes, o.created_at, o.updated_at, s.shipping_provider, s.tracking_number, u.full_name, u.phone ' +
      'FROM orders o ' +
      'LEFT JOIN shipping s ON s.order_id = o.id ' +
      'LEFT JOIN users u ON u.id = o.user_id ' +
      'WHERE o.deleted_at IS NULL';
    const params: any[] = [];
    let paramCount = 0;

    // Filter theo status nếu có
    if (status) {
      paramCount++;
      query += ` AND order_status = $${paramCount}`;
      params.push(status);
    }

    // Count total
    const countQuery = query.replace(
      'SELECT o.id, o.user_id, o.order_number, o.total_amount, o.order_status, o.payment_status, o.shipping_address, o.payment_method, o.shipping_fee, o.notes, o.created_at, o.updated_at, s.shipping_provider, s.tracking_number, u.full_name, u.phone',
      'SELECT COUNT(*)'
    );
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

// Lấy chi tiết đơn hàng (admin có thể xem bất kỳ đơn hàng nào)
export const getOrderById = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  try {
    logger.info('Admin fetching order by ID', { orderId: id, adminId: req.user?.id });

    // Lấy thông tin đơn hàng cơ bản (không cần kiểm tra user_id vì admin có thể xem tất cả)
    const orderResult = await pool.query(
      `SELECT o.*, u.full_name, u.phone
       FROM orders o
       LEFT JOIN users u ON u.id = o.user_id
       WHERE o.id = $1 AND o.deleted_at IS NULL`,
      [id]
    );

    if (orderResult.rows.length === 0) {
      return ResponseHandler.notFound(res, 'Đơn hàng không tồn tại');
    }

    const order = orderResult.rows[0];

    // Lấy thông tin vận chuyển (nếu có)
    const shippingResult = await pool.query(
      `SELECT shipping_provider, tracking_number, shipping_fee
       FROM shipping
       WHERE order_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [id]
    );
    const shipping = shippingResult.rows[0];

    // Lấy order items với product và variant info (kèm cả snapshot SKU/thuộc tính)
    const itemsResult = await pool.query(
      `SELECT 
         oi.id,
         oi.product_id,
         oi.variant_id,
         oi.quantity,
         oi.price,
         oi.product_sku,
         oi.variant_sku,
         oi.variant_attributes_snapshot,
         p.id as product_id_full,
         p.name as product_name,
         p.price as product_price,
         pv.id as variant_id_full,
         pv.variant_attributes,
         pv.price_adjustment
       FROM order_items oi 
       JOIN products p ON oi.product_id = p.id
       LEFT JOIN product_variants pv ON oi.variant_id = pv.id
       WHERE oi.order_id = $1`,
      [id]
    );

    const rawItems = itemsResult.rows;

    // Gom danh sách product_id và variant_id để tránh N+1 queries khi lấy images
    const productIds = Array.from(
      new Set(rawItems.map(row => row.product_id).filter((pid) => pid != null))
    );
    const variantIds = Array.from(
      new Set(rawItems.map(row => row.variant_id).filter((vid) => vid != null))
    );

    let productImagesMap = new Map<number, string[]>();
    let variantImagesMap = new Map<number, string[]>();

    if (productIds.length > 0) {
      const productImagesResult = await pool.query(
        `SELECT product_id, image_url
         FROM product_media
         WHERE product_id = ANY($1::int[]) 
           AND type = 'image' 
           AND variant_id IS NULL
         ORDER BY display_order, id`,
        [productIds]
      );

      productImagesMap = productImagesResult.rows.reduce(
        (map: Map<number, string[]>, row: any) => {
          const pid = row.product_id as number;
          const list = map.get(pid) || [];
          list.push(row.image_url);
          map.set(pid, list);
          return map;
        },
        new Map<number, string[]>()
      );
    }

    if (variantIds.length > 0) {
      const variantImagesResult = await pool.query(
        `SELECT variant_id, image_url
         FROM product_media
         WHERE variant_id = ANY($1::int[])
           AND type = 'image'
         ORDER BY display_order, id`,
        [variantIds]
      );

      variantImagesMap = variantImagesResult.rows.reduce(
        (map: Map<number, string[]>, row: any) => {
          const vid = row.variant_id as number;
          const list = map.get(vid) || [];
          list.push(row.image_url);
          map.set(vid, list);
          return map;
        },
        new Map<number, string[]>()
      );
    }

    const items = rawItems.map((item) => {
      const productImageUrls = productImagesMap.get(item.product_id) || [];
      const variantImageUrls = item.variant_id
        ? variantImagesMap.get(item.variant_id) || []
        : [];

      return {
        id: item.id,
        product_id: item.product_id,
        variant_id: item.variant_id,
        quantity: item.quantity,
        price: item.price,
        // Snapshot giúp giữ ổn định dữ liệu lịch sử đơn hàng
        product_sku: item.product_sku,
        variant_sku: item.variant_sku,
        variant_attributes_snapshot: item.variant_attributes_snapshot
          ? (typeof item.variant_attributes_snapshot === 'string'
              ? JSON.parse(item.variant_attributes_snapshot)
              : item.variant_attributes_snapshot)
          : null,
        product: {
          id: item.product_id_full,
          name: item.product_name,
          price: item.product_price,
          image_urls: productImageUrls,
        },
        variant: item.variant_id_full
          ? {
              id: item.variant_id_full,
              variant_attributes:
                typeof item.variant_attributes === 'string'
                  ? JSON.parse(item.variant_attributes)
                  : item.variant_attributes || {},
              price_adjustment: item.price_adjustment,
              image_urls: variantImageUrls,
            }
          : null,
      };
    });

        // Kết hợp tất cả
    const orderWithDetails = {
      ...order,
      full_name: order.full_name, // Từ users table
      phone: order.phone, // Từ users table
      ...(shipping && {
        shipping_provider: shipping.shipping_provider,
        tracking_number: shipping.tracking_number,
        // Ưu tiên shipping_fee từ bảng shipping nếu có
        shipping_fee: shipping.shipping_fee ?? order.shipping_fee,
      }),
      items,
    };

    logger.info('Admin order fetched successfully', { orderId: id, itemsCount: items.length });

    return ResponseHandler.success(res, { order: orderWithDetails }, 'Lấy thông tin đơn hàng thành công');
  } catch (error: any) {
    logger.error('Error fetching admin order', error instanceof Error ? error : new Error(String(error)), {
      orderId: id,
      adminId: req.user?.id,
      ip: req.ip,
      errorMessage: error.message,
      errorStack: error.stack,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi lấy thông tin đơn hàng', error);
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
    // Theo yêu cầu: đặt mật khẩu cố định cho staff mới
    const defaultPassword = '12345678';
    const passwordHash = await bcrypt.hash(defaultPassword, 10);

    const result = await pool.query(
      `INSERT INTO users (email, phone, password_hash, role, email_verified, phone_verified, status)
       VALUES ($1, $2, $3, $4, TRUE, TRUE, $5)
       RETURNING id, email, phone, role`,
      [email || null, phone || null, passwordHash, USER_ROLE.STAFF, USER_STATUS.ACTIVE]
    );

    // Ghi log tạo tài khoản staff (không log mật khẩu)
    logger.warn('Staff account created', {
      staffId: result.rows[0].id,
      email: result.rows[0].email,
      phone: result.rows[0].phone,
      env: appConfig.nodeEnv,
      ip: req.ip,
    });

    // Password handling:
    // - Development: trả về defaultPassword trong response để tiện test.
    // - Production: KHÔNG trả password trong response, cần triển khai gửi mật khẩu/đặt lại qua email an toàn.
    const responsePayload: any = {
      staff: result.rows[0],
      message:
        appConfig.nodeEnv === 'production'
          ? 'Tài khoản staff đã được tạo. Vui lòng hướng dẫn nhân viên đặt lại mật khẩu qua kênh an toàn.'
          : 'Tài khoản staff đã được tạo. Vui lòng lưu mật khẩu.',
    };

    if (appConfig.nodeEnv === 'development') {
      responsePayload.defaultPassword = defaultPassword;
    }

    return ResponseHandler.created(res, responsePayload, 'Tạo tài khoản staff thành công');
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
    // Không cho admin thao tác quản lý với tài khoản khách hàng (customer)
    const targetUserResult = await pool.query('SELECT id, role FROM users WHERE id = $1', [id]);
    if (targetUserResult.rows.length === 0) {
      return ResponseHandler.notFound(res, 'Người dùng không tồn tại');
    }

    const targetUser = targetUserResult.rows[0];
    if (targetUser.role === USER_ROLE.CUSTOMER) {
      return ResponseHandler.forbidden(res, 'Không được phép thao tác với tài khoản khách hàng');
    }

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
      dateFilterOrders = 'AND created_at BETWEEN $1 AND $2';
      // Cho truy vấn có alias orders là o
      dateFilterOrdersWithAlias = 'AND o.created_at BETWEEN $1 AND $2';
      params.push(start_date, end_date);
    }

    // Total orders: đếm tất cả đơn hàng (trừ cancelled và deleted)
    const totalOrdersResult = await pool.query(
      `SELECT COUNT(*) as total
       FROM orders 
       WHERE deleted_at IS NULL 
       AND order_status != 'cancelled'
       ${dateFilterOrders}`,
      params
    );

    // Revenue: chỉ tính từ orders đã thanh toán thành công (payment_status = 'paid')
    // Doanh thu KHÔNG bao gồm shipping_fee: total_amount - shipping_fee = subtotal - discount + tax
    // Delivered orders: đếm số đơn đã giao (không phụ thuộc payment_status)
    const ordersResult = await pool.query(
      `SELECT 
       COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN total_amount - shipping_fee ELSE 0 END), 0) as revenue,
       COUNT(CASE WHEN order_status = 'delivered' THEN 1 END) as delivered
       FROM orders 
       WHERE deleted_at IS NULL 
       ${dateFilterOrders}`,
      params
    );

    const totalRevenue = parseFloat(ordersResult.rows[0].revenue || '0');

    // Total customers (loại trừ admin & staff)
    const usersResult = await pool.query(
      'SELECT COUNT(*) as total FROM users WHERE status <> $1 AND role = $2',
      [USER_STATUS.DELETED, USER_ROLE.CUSTOMER]
    );

    // Top products (chỉ tính từ orders đã thanh toán thành công)
    const topProductsResult = await pool.query(
      `SELECT p.id, p.name, 
       SUM(oi.quantity) as total_sold, 
       SUM(oi.quantity * oi.price) as revenue
       FROM order_items oi
       JOIN products p ON oi.product_id = p.id
       JOIN orders o ON oi.order_id = o.id
       WHERE o.deleted_at IS NULL
       AND o.payment_status = 'paid'
       ${dateFilterOrdersWithAlias}
       GROUP BY p.id, p.name
       HAVING SUM(oi.quantity) > 0
       ORDER BY total_sold DESC
       LIMIT 10`,
      params
    );

    return ResponseHandler.success(res, {
      orders: {
        total: totalOrdersResult.rows[0].total,
        delivered: ordersResult.rows[0].delivered,
        revenue: totalRevenue.toString(),
      },
      users: usersResult.rows[0],
      topProducts: topProductsResult.rows,
    }, 'Lấy thống kê thành công');
  } catch (error: any) {
    logger.error('Error fetching statistics', error instanceof Error ? error : new Error(String(error)));
    return ResponseHandler.internalError(res, 'Lỗi khi lấy thống kê', error);
  }
};

