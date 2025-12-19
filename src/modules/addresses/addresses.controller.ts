import { Response } from 'express';
import { AuthRequest } from '../../types/request.types';
import { pool } from '../../connections';
import { createAddressSchema, updateAddressSchema } from './addresses.validation';
import { ResponseHandler } from '../../utils/response';
import { logger } from '../../utils/logging';

// Get all addresses for current user
export const getAddresses = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  try {
    if (!userId) {
      return ResponseHandler.error(res, 'Người dùng chưa đăng nhập', 401);
    }

    const result = await pool.query(
      `SELECT id, user_id, full_name, phone, province, district, ward, street_address, is_default, created_at, updated_at 
       FROM user_addresses 
       WHERE user_id = $1 AND deleted_at IS NULL
       ORDER BY is_default DESC, created_at DESC`,
      [userId]
    );

    return ResponseHandler.success(res, result.rows, 'Lấy danh sách địa chỉ thành công');
  } catch (error: any) {
    logger.error('Error fetching addresses', error instanceof Error ? error : new Error(String(error)), {
      userId,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi lấy danh sách địa chỉ', error);
  }
};

// Get address by ID
export const getAddressById = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.user?.id;
  try {
    if (!userId) {
      return ResponseHandler.error(res, 'Người dùng chưa đăng nhập', 401);
    }

    const result = await pool.query(
      `SELECT id, user_id, full_name, phone, province, district, ward, street_address, is_default, created_at, updated_at 
       FROM user_addresses 
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return ResponseHandler.notFound(res, 'Địa chỉ không tồn tại');
    }

    return ResponseHandler.success(res, result.rows[0], 'Lấy thông tin địa chỉ thành công');
  } catch (error: any) {
    logger.error('Error fetching address', error instanceof Error ? error : new Error(String(error)), {
      addressId: id,
      userId,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi lấy thông tin địa chỉ', error);
  }
};

// Create new address
export const createAddress = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  try {
    if (!userId) {
      return ResponseHandler.error(res, 'Người dùng chưa đăng nhập', 401);
    }
    const validated = createAddressSchema.parse(req.body);

    // If this is set as default, unset other defaults
    if (validated.is_default) {
      await pool.query(
        'UPDATE user_addresses SET is_default = FALSE WHERE user_id = $1',
        [userId]
      );
    }

    const result = await pool.query(
      `INSERT INTO user_addresses (user_id, full_name, phone, province, district, ward, street_address, is_default)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, user_id, full_name, phone, province, district, ward, street_address, is_default, created_at, updated_at`,
      [
        userId,
        validated.full_name,
        validated.phone,
        validated.province,
        validated.district,
        validated.ward,
        validated.street_address,
        validated.is_default || false,
      ]
    );

    return ResponseHandler.created(res, result.rows[0], 'Thêm địa chỉ thành công');
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return ResponseHandler.validationError(res, error.errors);
    }
    logger.error('Error creating address', error instanceof Error ? error : new Error(String(error)), {
      userId,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi thêm địa chỉ', error);
  }
};

// Update address
export const updateAddress = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.user?.id;
  try {
    if (!userId) {
      return ResponseHandler.error(res, 'Người dùng chưa đăng nhập', 401);
    }
    const validated = updateAddressSchema.parse(req.body);

    // Check if address exists and belongs to user
    const checkResult = await pool.query(
      'SELECT id FROM user_addresses WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
      [id, userId]
    );

    if (checkResult.rows.length === 0) {
      return ResponseHandler.notFound(res, 'Địa chỉ không tồn tại');
    }

    // If setting as default, unset other defaults
    if (validated.is_default === true) {
      await pool.query(
        'UPDATE user_addresses SET is_default = FALSE WHERE user_id = $1 AND id != $2',
        [userId, id]
      );
    }

    // Build update query
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 0;

    if (validated.full_name !== undefined) {
      paramCount++;
      updates.push(`full_name = $${paramCount}`);
      values.push(validated.full_name);
    }
    if (validated.phone !== undefined) {
      paramCount++;
      updates.push(`phone = $${paramCount}`);
      values.push(validated.phone);
    }
    if (validated.province !== undefined) {
      paramCount++;
      updates.push(`province = $${paramCount}`);
      values.push(validated.province);
    }
    if (validated.district !== undefined) {
      paramCount++;
      updates.push(`district = $${paramCount}`);
      values.push(validated.district);
    }
    if (validated.ward !== undefined) {
      paramCount++;
      updates.push(`ward = $${paramCount}`);
      values.push(validated.ward);
    }
    if (validated.street_address !== undefined) {
      paramCount++;
      updates.push(`street_address = $${paramCount}`);
      values.push(validated.street_address);
    }
    if (validated.is_default !== undefined) {
      paramCount++;
      updates.push(`is_default = $${paramCount}`);
      values.push(validated.is_default);
    }

    if (updates.length === 0) {
      return ResponseHandler.error(res, 'Không có trường nào để cập nhật', 400);
    }

    paramCount++;
    updates.push(`updated_at = NOW()`);
    paramCount++;
    values.push(id);
    paramCount++;
    values.push(userId);

    const result = await pool.query(
      `UPDATE user_addresses 
       SET ${updates.join(', ')} 
       WHERE id = $${paramCount - 1} AND user_id = $${paramCount}
       RETURNING id, user_id, full_name, phone, province, district, ward, street_address, is_default, created_at, updated_at`,
      values
    );

    return ResponseHandler.success(res, result.rows[0], 'Cập nhật địa chỉ thành công');
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return ResponseHandler.validationError(res, error.errors);
    }
    logger.error('Error updating address', error instanceof Error ? error : new Error(String(error)), {
      addressId: id,
      userId,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi cập nhật địa chỉ', error);
  }
};

// Delete address
export const deleteAddress = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.user?.id;
  try {
    if (!userId) {
      return ResponseHandler.error(res, 'Người dùng chưa đăng nhập', 401);
    }

    const result = await pool.query(
      `UPDATE user_addresses 
       SET deleted_at = NOW(), is_default = FALSE 
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
       RETURNING id`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return ResponseHandler.notFound(res, 'Địa chỉ không tồn tại');
    }

    return ResponseHandler.success(res, null, 'Xóa địa chỉ thành công');
  } catch (error: any) {
    logger.error('Error deleting address', error instanceof Error ? error : new Error(String(error)), {
      addressId: id,
      userId,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi xóa địa chỉ', error);
  }
};


