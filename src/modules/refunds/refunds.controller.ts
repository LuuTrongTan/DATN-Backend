import { Response } from 'express';
import { AuthRequest } from '../../types/request.types';
import { pool } from '../../connections';
import { createRefundSchema, updateRefundStatusSchema } from './refunds.validation';
import { ResponseHandler } from '../../utils/response';
import { logger } from '../../utils/logging';

// Helper: Tạo refund_number unique
async function generateRefundNumber(): Promise<string> {
  let refundNumber: string;
  let exists = true;
  
  while (exists) {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    refundNumber = `RF-${timestamp}-${random}`;
    
    const check = await pool.query(
      'SELECT id FROM refunds WHERE refund_number = $1',
      [refundNumber]
    );
    
    exists = check.rows.length > 0;
  }
  
  return refundNumber!;
}

// Helper: Validate refund request
async function validateRefundRequest(orderId: number, userId: string, items: Array<{ order_item_id: number; quantity: number }>): Promise<{ valid: boolean; error?: string; orderItems?: any[] }> {
  // Kiểm tra order tồn tại và thuộc về user
  const orderCheck = await pool.query(
    `SELECT id, user_id, order_status, payment_status, total_amount, created_at
     FROM orders
     WHERE id = $1 AND deleted_at IS NULL`,
    [orderId]
  );
  
  if (orderCheck.rows.length === 0) {
    return { valid: false, error: 'Đơn hàng không tồn tại' };
  }
  
  const order = orderCheck.rows[0];
  
  // Kiểm tra order thuộc về user
  if (order.user_id !== userId) {
    return { valid: false, error: 'Bạn không có quyền refund đơn hàng này' };
  }
  
  // Kiểm tra order status có thể refund không (chỉ cho phép refund khi đã delivered hoặc cancelled)
  if (!['delivered', 'cancelled'].includes(order.order_status)) {
    return { valid: false, error: 'Chỉ có thể yêu cầu refund cho đơn hàng đã giao hoặc đã hủy' };
  }
  
  // Kiểm tra thời gian (ví dụ: chỉ cho phép refund trong vòng 30 ngày)
  const orderDate = new Date(order.created_at);
  const daysSinceOrder = (Date.now() - orderDate.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceOrder > 30) {
    return { valid: false, error: 'Chỉ có thể yêu cầu refund trong vòng 30 ngày kể từ ngày đặt hàng' };
  }
  
  // Kiểm tra order items
  const orderItemsResult = await pool.query(
    `SELECT oi.id, oi.order_id, oi.product_id, oi.variant_id, oi.quantity, oi.price
     FROM order_items oi
     WHERE oi.order_id = $1`,
    [orderId]
  );
  
  const orderItems = orderItemsResult.rows;
  
  if (orderItems.length === 0) {
    return { valid: false, error: 'Đơn hàng không có sản phẩm nào' };
  }
  
  // Kiểm tra items có hợp lệ không
  for (const item of items) {
    const orderItem = orderItems.find(oi => oi.id === item.order_item_id);
    if (!orderItem) {
      return { valid: false, error: `Order item ${item.order_item_id} không tồn tại trong đơn hàng` };
    }
    if (item.quantity > orderItem.quantity) {
      return { valid: false, error: `Số lượng refund không được vượt quá số lượng đã mua` };
    }
  }
  
  // Kiểm tra đã có refund pending hoặc approved chưa
  const existingRefunds = await pool.query(
    `SELECT id, status FROM refunds
     WHERE order_id = $1 AND status IN ('pending', 'approved', 'processing')`,
    [orderId]
  );
  
  if (existingRefunds.rows.length > 0) {
    return { valid: false, error: 'Đơn hàng này đã có yêu cầu refund đang xử lý' };
  }
  
  return { valid: true, orderItems };
}

// Helper: Tính số tiền hoàn
function calculateRefundAmount(orderItems: any[], refundItems: Array<{ order_item_id: number; quantity: number }>): number {
  let total = 0;
  
  for (const refundItem of refundItems) {
    const orderItem = orderItems.find(oi => oi.id === refundItem.order_item_id);
    if (orderItem) {
      const itemPrice = parseFloat(orderItem.price) || 0;
      const refundAmount = (itemPrice / orderItem.quantity) * refundItem.quantity;
      total += refundAmount;
    }
  }
  
  return Math.round(total);
}

// Tạo refund request
export const createRefund = async (req: AuthRequest, res: Response) => {
  try {
    const validated = createRefundSchema.parse(req.body);
    const userId = req.user!.id;
    
    // Validate refund request (sử dụng pool chung, ngoài transaction)
    const validation = await validateRefundRequest(validated.order_id, userId, validated.items);
    if (!validation.valid) {
      return ResponseHandler.badRequest(res, validation.error || 'Yêu cầu refund không hợp lệ');
    }
    
    const orderItems = validation.orderItems!;
    
    // Tính số tiền hoàn
    const refundAmount = calculateRefundAmount(orderItems, validated.items);
    
    // Tạo refund_number
    const refundNumber = await generateRefundNumber();

    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      
      // Tạo refund
      const refundResult = await client.query(
        `INSERT INTO refunds (refund_number, order_id, user_id, type, reason, status, refund_amount)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, refund_number, order_id, user_id, type, reason, status, refund_amount, created_at, updated_at`,
        [refundNumber, validated.order_id, userId, validated.type, validated.reason, 'pending', refundAmount]
      );
      
      const refund = refundResult.rows[0];
      
      // Tạo refund_items
      for (const item of validated.items) {
        const orderItem = orderItems.find(oi => oi.id === item.order_item_id);
        if (orderItem) {
          const itemPrice = parseFloat(orderItem.price) || 0;
          const itemRefundAmount = Math.round((itemPrice / orderItem.quantity) * item.quantity);
          
          await client.query(
            `INSERT INTO refund_items (refund_id, order_item_id, quantity, refund_amount, reason)
             VALUES ($1, $2, $3, $4, $5)`,
            [refund.id, item.order_item_id, item.quantity, itemRefundAmount, item.reason || null]
          );
        }
      }
      
      // Lấy lại refund với items
      const refundWithItems = await client.query(
        `SELECT r.*,
         (SELECT json_agg(json_build_object(
           'id', ri.id,
           'order_item_id', ri.order_item_id,
           'quantity', ri.quantity,
           'refund_amount', ri.refund_amount,
           'reason', ri.reason
         )) FROM refund_items ri WHERE ri.refund_id = r.id) as items
         FROM refunds r
         WHERE r.id = $1`,
        [refund.id]
      );

      await client.query('COMMIT');
      
      return ResponseHandler.created(res, refundWithItems.rows[0], 'Tạo yêu cầu refund thành công');
    } catch (error: any) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return ResponseHandler.badRequest(res, 'Dữ liệu không hợp lệ', error.errors);
    }
    logger.error('Error creating refund', error instanceof Error ? error : new Error(String(error)), {
      body: req.body,
      userId: req.user?.id,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi tạo yêu cầu refund', error);
  }
};

// Lấy danh sách refunds
export const getRefunds = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const userRole = req.user!.role;
    const { status, type, page = 1, limit = 20 } = req.query;
    
    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 20;
    
    // Base FROM/WHERE để tái sử dụng cho count & data
    let baseQuery = `
      FROM refunds r
      INNER JOIN orders o ON r.order_id = o.id
      WHERE o.deleted_at IS NULL
    `;

    const params: any[] = [];
    let paramCount = 0;
    
    // Customer chỉ thấy refunds của mình, admin/staff thấy tất cả
    if (userRole !== 'admin' && userRole !== 'staff') {
      paramCount++;
      baseQuery += ` AND r.user_id = $${paramCount}`;
      params.push(userId);
    }
    
    if (status) {
      paramCount++;
      baseQuery += ` AND r.status = $${paramCount}`;
      params.push(status);
    }
    
    if (type) {
      paramCount++;
      baseQuery += ` AND r.type = $${paramCount}`;
      params.push(type);
    }
    
    // Count total
    const countQuery = `SELECT COUNT(*) ${baseQuery}`;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows?.[0]?.count ?? '0');

    // Query data with items subselect
    const dataQuery = `
      SELECT r.*,
        o.order_number,
        o.total_amount as order_total,
        (
          SELECT json_agg(
            json_build_object(
              'id', ri.id,
              'order_item_id', ri.order_item_id,
              'quantity', ri.quantity,
              'refund_amount', ri.refund_amount,
              'reason', ri.reason
            )
          )
          FROM refund_items ri
          WHERE ri.refund_id = r.id
        ) as items
      ${baseQuery}
      ORDER BY r.created_at DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;
    params.push(limitNum);
    params.push((pageNum - 1) * limitNum);
    
    const result = await pool.query(dataQuery, params);
    
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
    logger.error('Error fetching refunds', error instanceof Error ? error : new Error(String(error)), {
      userId: req.user?.id,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi lấy danh sách refunds', error);
  }
};

// Lấy refund theo ID
export const getRefundById = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.user!.id;
  const userRole = req.user!.role;
  
  try {
    let query = `
      SELECT r.*,
      o.order_number,
      o.total_amount as order_total,
      (SELECT json_agg(json_build_object(
        'id', ri.id,
        'order_item_id', ri.order_item_id,
        'quantity', ri.quantity,
        'refund_amount', ri.refund_amount,
        'reason', ri.reason
      )) FROM refund_items ri WHERE ri.refund_id = r.id) as items
      FROM refunds r
      INNER JOIN orders o ON r.order_id = o.id
      WHERE r.id = $1 AND o.deleted_at IS NULL
    `;
    
    const params: any[] = [id];
    
    // Customer chỉ thấy refunds của mình
    if (userRole !== 'admin' && userRole !== 'staff') {
      query += ` AND r.user_id = $2`;
      params.push(userId);
    }
    
    const result = await pool.query(query, params);
    
    if (result.rows.length === 0) {
      return ResponseHandler.notFound(res, 'Refund không tồn tại');
    }
    
    return ResponseHandler.success(res, result.rows[0]);
  } catch (error: any) {
    logger.error('Error fetching refund', error instanceof Error ? error : new Error(String(error)), {
      refundId: id,
      userId: req.user?.id,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi lấy thông tin refund', error);
  }
};

// Cập nhật refund status (admin/staff only)
export const updateRefundStatus = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  try {
    const validated = updateRefundStatusSchema.parse(req.body);
    
    // Kiểm tra refund tồn tại
    const refundCheck = await pool.query(
      'SELECT id, status FROM refunds WHERE id = $1',
      [id]
    );
    
    if (refundCheck.rows.length === 0) {
      return ResponseHandler.notFound(res, 'Refund không tồn tại');
    }
    
    const currentStatus = refundCheck.rows[0].status;
    
    // Build update query
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 0;
    
    paramCount++;
    updates.push(`status = $${paramCount}`);
    values.push(validated.status);
    
    if (validated.admin_notes !== undefined) {
      paramCount++;
      updates.push(`admin_notes = $${paramCount}`);
      values.push(validated.admin_notes);
    }
    
    if (validated.refund_amount !== undefined) {
      paramCount++;
      updates.push(`refund_amount = $${paramCount}`);
      values.push(validated.refund_amount);
    }
    
    // Nếu status là approved hoặc processing, set processed_by và processed_at
    if (validated.status === 'approved' || validated.status === 'processing') {
      paramCount++;
      updates.push(`processed_by = $${paramCount}`);
      values.push(req.user!.id);
      
      updates.push(`processed_at = NOW()`);
    }
    
    updates.push(`updated_at = NOW()`);
    
    paramCount++;
    values.push(id);
    
    const result = await pool.query(
      `UPDATE refunds SET ${updates.join(', ')} WHERE id = $${paramCount}
       RETURNING id, refund_number, order_id, user_id, type, reason, status, refund_amount, admin_notes, processed_by, processed_at, created_at, updated_at`,
      values
    );
    
    // Lấy lại refund với items
    const refundWithItems = await pool.query(
      `SELECT r.*,
       (SELECT json_agg(json_build_object(
         'id', ri.id,
         'order_item_id', ri.order_item_id,
         'quantity', ri.quantity,
         'refund_amount', ri.refund_amount,
         'reason', ri.reason
       )) FROM refund_items ri WHERE ri.refund_id = r.id) as items
       FROM refunds r
       WHERE r.id = $1`,
      [id]
    );
    
    return ResponseHandler.success(res, refundWithItems.rows[0], 'Cập nhật refund status thành công');
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return ResponseHandler.badRequest(res, 'Dữ liệu không hợp lệ', error.errors);
    }
    logger.error('Error updating refund status', error instanceof Error ? error : new Error(String(error)), {
      refundId: id,
      body: req.body,
      userId: req.user?.id,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi cập nhật refund status', error);
  }
};

// Hủy refund (customer only, nếu status = pending)
export const cancelRefund = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.user!.id;
  
  try {
    // Kiểm tra refund tồn tại và thuộc về user
    const refundCheck = await pool.query(
      'SELECT id, status, user_id FROM refunds WHERE id = $1',
      [id]
    );
    
    if (refundCheck.rows.length === 0) {
      return ResponseHandler.notFound(res, 'Refund không tồn tại');
    }
    
    const refund = refundCheck.rows[0];
    
    if (refund.user_id !== userId) {
      return ResponseHandler.forbidden(res, 'Bạn không có quyền hủy refund này');
    }
    
    if (refund.status !== 'pending') {
      return ResponseHandler.badRequest(res, 'Chỉ có thể hủy refund khi status là pending');
    }
    
    // Cập nhật status thành cancelled
    const result = await pool.query(
      `UPDATE refunds SET status = 'cancelled', updated_at = NOW()
       WHERE id = $1
       RETURNING id, refund_number, order_id, user_id, type, reason, status, refund_amount, created_at, updated_at`,
      [id]
    );
    
    return ResponseHandler.success(res, result.rows[0], 'Hủy refund thành công');
  } catch (error: any) {
    logger.error('Error cancelling refund', error instanceof Error ? error : new Error(String(error)), {
      refundId: id,
      userId: req.user?.id,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi hủy refund', error);
  }
};
