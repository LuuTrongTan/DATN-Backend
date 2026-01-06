import { Response } from 'express';
import { AuthRequest } from '../../types/request.types';
import { pool } from '../../connections';
import { calculateShippingFee, createShippingRecord, createShippingOrder, trackShippingOrder } from './shipping.service';
import { ResponseHandler } from '../../utils/response';
import { logger } from '../../utils/logging';

// Calculate shipping fee
export const calculateFee = async (req: AuthRequest, res: Response) => {
  const province = req.body.province;
  const district = req.body.district;
  try {
    const { weight, value, ward } = req.body;

    if (!province || !district) {
      return ResponseHandler.error(res, 'Tỉnh/thành phố và quận/huyện là bắt buộc', 400);
    }

    const result = await calculateShippingFee({
      province,
      district,
      ward,
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

    // Check if user owns the order or is admin/staff, only for orders not soft-deleted
    const orderCheck = await pool.query(
      'SELECT id, user_id FROM orders WHERE id = $1 AND deleted_at IS NULL',
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

// Create shipping order (admin/staff)
export const createOrder = async (req: AuthRequest, res: Response) => {
  try {
    const {
      order_id,
      from_name,
      from_phone,
      from_address,
      from_province,
      from_district,
      from_ward,
      to_name,
      to_phone,
      to_address,
      to_province,
      to_district,
      to_ward,
      weight,
      value,
      cod,
      note,
    } = req.body;

    // Validate required fields
    if (!order_id || !to_name || !to_phone || !to_address || !to_province || !to_district) {
      return ResponseHandler.error(res, 'Thiếu thông tin bắt buộc', 400);
    }

    // Get order info
    const orderResult = await pool.query(
      'SELECT id, order_number, total_amount FROM orders WHERE id = $1 AND deleted_at IS NULL',
      [order_id]
    );

    if (orderResult.rows.length === 0) {
      return ResponseHandler.notFound(res, 'Đơn hàng không tồn tại');
    }

    const order = orderResult.rows[0];

    // Get shop info from environment or use defaults
    const shopName = process.env.SHOP_NAME || 'Shop';
    const shopPhone = process.env.SHOP_PHONE || '';
    const shopAddress = process.env.SHOP_ADDRESS || '';
    const shopProvince = process.env.SHOP_PROVINCE || 'Thành phố Hồ Chí Minh';
    const shopDistrict = process.env.SHOP_DISTRICT || 'Quận 1';
    const shopWard = process.env.SHOP_WARD || '';

    // Create shipping order via Goship
    const shippingResult = await createShippingOrder({
      order_id: order.id,
      order_number: order.order_number,
      from_name: from_name || shopName,
      from_phone: from_phone || shopPhone,
      from_address: from_address || shopAddress,
      from_province: from_province || shopProvince,
      from_district: from_district || shopDistrict,
      from_ward: from_ward || shopWard,
      to_name: to_name,
      to_phone: to_phone,
      to_address: to_address,
      to_province: to_province,
      to_district: to_district,
      to_ward: to_ward,
      weight: weight || 1,
      value: value || parseFloat(order.total_amount),
      cod: cod,
      note: note,
    });

    if (!shippingResult.success) {
      return ResponseHandler.error(res, shippingResult.error || 'Không thể tạo đơn vận chuyển', 500);
    }

    // Save shipping record to database
    const shippingId = await createShippingRecord(pool, {
      order_id: order.id,
      shipping_provider: 'Goship',
      tracking_number: shippingResult.tracking_number,
      shipping_fee: shippingResult.fee || 0,
    });

    return ResponseHandler.success(
      res,
      {
        shipping_id: shippingId,
        tracking_number: shippingResult.tracking_number,
        fee: shippingResult.fee,
      },
      'Tạo đơn vận chuyển thành công'
    );
  } catch (error: any) {
    logger.error('Error creating shipping order', error instanceof Error ? error : new Error(String(error)), {
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi tạo đơn vận chuyển', error);
  }
};

// Track shipping order
export const trackOrder = async (req: AuthRequest, res: Response) => {
  try {
    const { tracking_number } = req.params;

    if (!tracking_number) {
      return ResponseHandler.error(res, 'Mã vận đơn là bắt buộc', 400);
    }

    const trackingResult = await trackShippingOrder(tracking_number);

    if (!trackingResult) {
      return ResponseHandler.notFound(res, 'Không tìm thấy thông tin vận đơn');
    }

    return ResponseHandler.success(res, trackingResult, 'Lấy thông tin vận đơn thành công');
  } catch (error: any) {
    logger.error('Error tracking shipping order', error instanceof Error ? error : new Error(String(error)), {
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi tra cứu vận đơn', error);
  }
};


