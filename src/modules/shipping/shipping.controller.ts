import { Response } from 'express';
import { AuthRequest } from '../../types/request.types';
import { pool } from '../../connections';
import { calculateShippingFee, createShippingRecord } from './shipping.service';

// Calculate shipping fee
export const calculateFee = async (req: AuthRequest, res: Response) => {
  try {
    const { province, district, weight, value } = req.body;

    if (!province || !district) {
      return res.status(400).json({
        success: false,
        message: 'Tỉnh/thành phố và quận/huyện là bắt buộc',
      });
    }

    const result = calculateShippingFee({
      province,
      district,
      weight: weight || 1, // Default 1kg
      value: value || 0,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get shipping info for order
export const getShippingInfo = async (req: AuthRequest, res: Response) => {
  try {
    const { order_id } = req.params;
    const userId = req.user!.id;

    // Check if user owns the order or is admin/staff
    const orderCheck = await pool.query(
      'SELECT id, user_id FROM orders WHERE id = $1',
      [order_id]
    );

    if (orderCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Đơn hàng không tồn tại',
      });
    }

    const order = orderCheck.rows[0];
    const isOwner = order.user_id === userId;
    const isAdmin = req.user!.role === 'admin' || req.user!.role === 'staff';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Không có quyền truy cập',
      });
    }

    const result = await pool.query(
      'SELECT * FROM shipping WHERE order_id = $1',
      [order_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Chưa có thông tin vận chuyển',
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

// Update shipping info (admin/staff)
export const updateShippingInfo = async (req: AuthRequest, res: Response) => {
  try {
    const { order_id } = req.params;
    const { tracking_number, shipping_provider, status, notes } = req.body;

    // Check if shipping record exists
    const checkResult = await pool.query(
      'SELECT id FROM shipping WHERE order_id = $1',
      [order_id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Chưa có thông tin vận chuyển',
      });
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
      return res.status(400).json({
        success: false,
        message: 'Không có trường nào để cập nhật',
      });
    }

    paramCount++;
    updates.push(`updated_at = NOW()`);
    paramCount++;
    values.push(order_id);

    const result = await pool.query(
      `UPDATE shipping SET ${updates.join(', ')} WHERE order_id = $${paramCount} RETURNING *`,
      values
    );

    res.json({
      success: true,
      message: 'Cập nhật thông tin vận chuyển thành công',
      data: result.rows[0],
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

