import { Response } from 'express';
import { AuthRequest } from '../../types/request.types';
import { pool } from '../../connections';
import { calculateShippingFee, createShippingRecord } from './shipping.service';
import { ResponseHandler } from '../../utils/response';
import { logger } from '../../utils/logging';

// Calculate shipping fee
export const calculateFee = async (req: AuthRequest, res: Response) => {
  const province = req.body.province;
  const district = req.body.district;
  try {
    const { weight, value } = req.body;

    if (!province || !district) {
      return ResponseHandler.error(res, 'Tỉnh/thành phố và quận/huyện là bắt buộc', 400);
    }

    const result = calculateShippingFee({
      province,
      district,
      weight: weight || 1, // Default 1kg
      value: value || 0,
    });

    return ResponseHandler.success(res, result, 'Tính phí vận chuyển thành công');
  } catch (error: any) {
    logger.error('Error calculating shipping fee', error instanceof Error ? error : new Error(String(error)), {
      province,
      district,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi tính phí vận chuyển', error);
  }
};

// Get shipping info for order
export const getShippingInfo = async (req: AuthRequest, res: Response) => {
  const { order_id } = req.params;
  const userId = req.user?.id;
  try {
    if (!userId) {
      return ResponseHandler.error(res, 'Người dùng chưa đăng nhập', 401);
    }

    // Check if user owns the order or is admin/staff
    const orderCheck = await pool.query(
      'SELECT id, user_id FROM orders WHERE id = $1',
      [order_id]
    );

    if (orderCheck.rows.length === 0) {
      return ResponseHandler.notFound(res, 'Đơn hàng không tồn tại');
    }

    const order = orderCheck.rows[0];
    const isOwner = order.user_id === userId;
    const isAdmin = req.user!.role === 'admin' || req.user!.role === 'staff';

    if (!isOwner && !isAdmin) {
      return ResponseHandler.forbidden(res, 'Không có quyền truy cập');
    }

    const result = await pool.query(
      'SELECT id, order_id, shipping_fee, shipping_provider, tracking_number, status, notes, created_at, updated_at FROM shipping WHERE order_id = $1',
      [order_id]
    );

    if (result.rows.length === 0) {
      return ResponseHandler.notFound(res, 'Chưa có thông tin vận chuyển');
    }

    return ResponseHandler.success(res, result.rows[0], 'Lấy thông tin vận chuyển thành công');
  } catch (error: any) {
    logger.error('Error fetching shipping info', error instanceof Error ? error : new Error(String(error)), {
      orderId: order_id,
      userId,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi lấy thông tin vận chuyển', error);
  }
};

// Update shipping info (admin/staff)
export const updateShippingInfo = async (req: AuthRequest, res: Response) => {
  const { order_id } = req.params;
  try {
    const { tracking_number, shipping_provider, status, notes } = req.body;

    // Check if shipping record exists
    const checkResult = await pool.query(
      'SELECT id FROM shipping WHERE order_id = $1',
      [order_id]
    );

    if (checkResult.rows.length === 0) {
      return ResponseHandler.notFound(res, 'Chưa có thông tin vận chuyển');
    }

    // Build update query
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 0;

    if (tracking_number !== undefined) {
      paramCount++;
      updates.push(`tracking_number = $${paramCount}`);
      values.push(tracking_number);
    }
    if (shipping_provider !== undefined) {
      paramCount++;
      updates.push(`shipping_provider = $${paramCount}`);
      values.push(shipping_provider);
    }
    if (status !== undefined) {
      paramCount++;
      updates.push(`status = $${paramCount}`);
      values.push(status);
    }
    if (notes !== undefined) {
      paramCount++;
      updates.push(`notes = $${paramCount}`);
      values.push(notes);
    }

    if (updates.length === 0) {
      return ResponseHandler.error(res, 'Không có trường nào để cập nhật', 400);
    }

    paramCount++;
    updates.push(`updated_at = NOW()`);
    paramCount++;
    values.push(order_id);

    const result = await pool.query(
      `UPDATE shipping SET ${updates.join(', ')} WHERE order_id = $${paramCount} RETURNING id, order_id, shipping_fee, shipping_provider, tracking_number, status, notes, created_at, updated_at`,
      values
    );

    return ResponseHandler.success(res, result.rows[0], 'Cập nhật thông tin vận chuyển thành công');
  } catch (error: any) {
    logger.error('Error updating shipping info', error instanceof Error ? error : new Error(String(error)), {
      orderId: order_id,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi cập nhật thông tin vận chuyển', error);
  }
};


