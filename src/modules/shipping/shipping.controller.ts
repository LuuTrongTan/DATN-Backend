import { Request, Response } from 'express';
import { AuthRequest } from '../../types/request.types';
import { pool } from '../../connections';
import { calculateShippingFee, createShippingRecord, createShippingOrder, trackShippingOrder } from './shipping.service';
import { ResponseHandler } from '../../utils/response';
import { logger } from '../../utils/logging';
import {
  getGHNServices,
  calculateGHNLeadtime,
  getGHNStations,
  cancelGHNOrder,
  updateGHNCOD,
  updateGHNOrder,
  GHNGetServicesRequest,
  GHNLeadtimeRequest,
  GHNGetStationsRequest,
  GHNCancelOrderRequest,
  GHNUpdateCODRequest,
  GHNUpdateOrderRequest,
} from './ghn.service';
import { getGHNDistricts } from '../provinces/ghn.service';
import { ORDER_STATUS } from '../../constants';

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

    // Create shipping order via GHN
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
      shipping_provider: 'GHN',
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

// Get available services (Nhanh, Chuẩn, Tiết kiệm)
export const getServices = async (req: AuthRequest, res: Response) => {
  try {
    const { from_district, to_district } = req.query;

    if (!from_district || !to_district) {
      return ResponseHandler.error(res, 'from_district và to_district là bắt buộc', 400);
    }

    const shopId = parseInt(process.env.GHN_SHOP_ID || '0', 10);
    if (!shopId) {
      return ResponseHandler.error(res, 'GHN Shop ID chưa được cấu hình', 500);
    }

    const request: GHNGetServicesRequest = {
      shop_id: shopId,
      from_district: parseInt(String(from_district), 10),
      to_district: parseInt(String(to_district), 10),
    };

    const services = await getGHNServices(request);

    return ResponseHandler.success(res, services, 'Lấy danh sách dịch vụ thành công');
  } catch (error: any) {
    logger.error('Error getting services', error instanceof Error ? error : new Error(String(error)), {
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi lấy danh sách dịch vụ', error);
  }
};

// Calculate expected delivery time
export const calculateLeadtime = async (req: AuthRequest, res: Response) => {
  try {
    const { from_district_id, from_ward_code, to_district_id, to_ward_code, service_id, service_type_id } = req.body;

    if (!from_district_id || !from_ward_code || !to_district_id || !to_ward_code) {
      return ResponseHandler.error(res, 'Thiếu thông tin bắt buộc', 400);
    }

    const request: GHNLeadtimeRequest = {
      from_district_id: parseInt(String(from_district_id), 10),
      from_ward_code: String(from_ward_code),
      to_district_id: parseInt(String(to_district_id), 10),
      to_ward_code: String(to_ward_code),
      service_id: service_id ? parseInt(String(service_id), 10) : undefined,
      service_type_id: service_type_id ? parseInt(String(service_type_id), 10) : undefined,
    };

    const result = await calculateGHNLeadtime(request);

    return ResponseHandler.success(res, result, 'Tính thời gian giao hàng thành công');
  } catch (error: any) {
    logger.error('Error calculating leadtime', error instanceof Error ? error : new Error(String(error)), {
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi tính thời gian giao hàng', error);
  }
};

// Get stations (bưu cục)
export const getStations = async (req: AuthRequest, res: Response) => {
  try {
    const { district_id } = req.query;

    const request: GHNGetStationsRequest = {
      district_id: district_id ? parseInt(String(district_id), 10) : 0,
    };

    const stations = await getGHNStations(request);

    return ResponseHandler.success(res, stations, 'Lấy danh sách bưu cục thành công');
  } catch (error: any) {
    logger.error('Error getting stations', error instanceof Error ? error : new Error(String(error)), {
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi lấy danh sách bưu cục', error);
  }
};

// Cancel order (admin/staff)
export const cancelOrder = async (req: AuthRequest, res: Response) => {
  try {
    const { order_codes } = req.body;

    if (!order_codes || !Array.isArray(order_codes) || order_codes.length === 0) {
      return ResponseHandler.error(res, 'order_codes là mảng bắt buộc', 400);
    }

    const request: GHNCancelOrderRequest = {
      order_codes: order_codes.map(String),
    };

    const result = await cancelGHNOrder(request);

    return ResponseHandler.success(res, result, 'Hủy đơn hàng thành công');
  } catch (error: any) {
    logger.error('Error canceling order', error instanceof Error ? error : new Error(String(error)), {
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi hủy đơn hàng', error);
  }
};

// Update COD (admin/staff)
export const updateCOD = async (req: AuthRequest, res: Response) => {
  try {
    const { order_code, cod_amount } = req.body;

    if (!order_code || cod_amount === undefined) {
      return ResponseHandler.error(res, 'order_code và cod_amount là bắt buộc', 400);
    }

    const request: GHNUpdateCODRequest = {
      order_code: String(order_code),
      cod_amount: parseFloat(String(cod_amount)),
    };

    const result = await updateGHNCOD(request);

    if (!result.success) {
      return ResponseHandler.error(res, result.message, 500);
    }

    return ResponseHandler.success(res, result, 'Cập nhật COD thành công');
  } catch (error: any) {
    logger.error('Error updating COD', error instanceof Error ? error : new Error(String(error)), {
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi cập nhật COD', error);
  }
};

// Update order (admin/staff)
export const updateOrder = async (req: AuthRequest, res: Response) => {
  try {
    const { order_code, to_name, to_phone, to_address, to_ward_code, to_district_id, to_province_id, note, required_note } = req.body;

    if (!order_code) {
      return ResponseHandler.error(res, 'order_code là bắt buộc', 400);
    }

    const request: GHNUpdateOrderRequest = {
      order_code: String(order_code),
      to_name,
      to_phone,
      to_address,
      to_ward_code,
      to_district_id: to_district_id ? parseInt(String(to_district_id), 10) : undefined,
      to_province_id: to_province_id ? parseInt(String(to_province_id), 10) : undefined,
      note,
      required_note,
    };

    const result = await updateGHNOrder(request);

    if (!result.success) {
      return ResponseHandler.error(res, result.message, 500);
    }

    return ResponseHandler.success(res, result, 'Cập nhật đơn hàng thành công');
  } catch (error: any) {
    logger.error('Error updating order', error instanceof Error ? error : new Error(String(error)), {
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi cập nhật đơn hàng', error);
  }
};

// GHN webhook callback: cập nhật trạng thái giao hàng
export const ghnWebhook = async (req: Request, res: Response) => {
  const secret = process.env.GHN_WEBHOOK_TOKEN;
  const incomingToken =
    (req.headers['x-ghn-token'] as string) ||
    (req.headers['x-gn-token'] as string) ||
    (req.headers['token'] as string) ||
    (req.body && req.body.token);

  if (secret && secret !== incomingToken) {
    return ResponseHandler.unauthorized(res, 'Chữ ký webhook không hợp lệ');
  }

  const { client_order_code, order_code, status, reason } = req.body || {};

  if (!client_order_code && !order_code) {
    return ResponseHandler.badRequest(res, 'Thiếu mã đơn hàng');
  }

  try {
    const orderResult = await pool.query(
      'SELECT id FROM orders WHERE order_number = $1',
      [client_order_code || order_code]
    );

    if (orderResult.rows.length === 0) {
      logger.warn('[GHN Webhook] Không tìm thấy đơn hàng', {
        client_order_code,
        order_code,
        status,
      });
      return ResponseHandler.notFound(res, 'Đơn hàng không tồn tại');
    }

    const orderId = orderResult.rows[0].id;

    await pool.query(
      `UPDATE shipping
       SET status = COALESCE($1, status),
           tracking_number = COALESCE(tracking_number, $2),
           updated_at = NOW()
       WHERE order_id = $3`,
      [status || null, order_code || null, orderId]
    );

    // Cập nhật trạng thái đơn hàng nếu GHN báo đã giao hoặc hủy
    if (status) {
      const normalized = String(status).toLowerCase();
      if (normalized.includes('delivered')) {
        await pool.query(
          `UPDATE orders SET order_status = $1, updated_at = NOW() WHERE id = $2`,
          [ORDER_STATUS.DELIVERED, orderId]
        );
      } else if (normalized.includes('cancel')) {
        await pool.query(
          `UPDATE orders SET order_status = $1, updated_at = NOW() WHERE id = $2`,
          [ORDER_STATUS.CANCELLED, orderId]
        );
      }
    }

    logger.info('[GHN Webhook] Đã cập nhật trạng thái đơn hàng', {
      orderId,
      client_order_code,
      order_code,
      status,
      reason,
    });

    return ResponseHandler.success(res, { order_id: orderId }, 'OK');
  } catch (error: any) {
    logger.error('Error handling GHN webhook', error instanceof Error ? error : new Error(String(error)), {
      client_order_code,
      order_code,
      status,
      reason,
    });
    return ResponseHandler.internalError(res, 'Lỗi xử lý webhook GHN', error);
  }
};


