import { Response } from 'express';
import { AuthRequest } from '../../types/request.types';
import { pool } from '../../connections';
import { createAddressSchema, updateAddressSchema } from './addresses.validation';

// Get all addresses for current user
export const getAddresses = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const result = await pool.query(
      `SELECT * FROM user_addresses 
       WHERE user_id = $1 
       ORDER BY is_default DESC, created_at DESC`,
      [userId]
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get address by ID
export const getAddressById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const result = await pool.query(
      'SELECT * FROM user_addresses WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Địa chỉ không tồn tại',
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

// Create new address
export const createAddress = async (req: AuthRequest, res: Response) => {
  try {
    const validated = createAddressSchema.parse(req.body);
    const userId = req.user!.id;

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
       RETURNING *`,
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

    res.status(201).json({
      success: true,
      message: 'Thêm địa chỉ thành công',
      data: result.rows[0],
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({
        success: false,
        message: 'Dữ liệu không hợp lệ',
        errors: error.errors,
      });
    }
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Update address
export const updateAddress = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const validated = updateAddressSchema.parse(req.body);

    // Check if address exists and belongs to user
    const checkResult = await pool.query(
      'SELECT id FROM user_addresses WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Địa chỉ không tồn tại',
      });
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
      return res.status(400).json({
        success: false,
        message: 'Không có trường nào để cập nhật',
      });
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
       RETURNING *`,
      values
    );

    res.json({
      success: true,
      message: 'Cập nhật địa chỉ thành công',
      data: result.rows[0],
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({
        success: false,
        message: 'Dữ liệu không hợp lệ',
        errors: error.errors,
      });
    }
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Delete address
export const deleteAddress = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const result = await pool.query(
      'DELETE FROM user_addresses WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Địa chỉ không tồn tại',
      });
    }

    res.json({
      success: true,
      message: 'Xóa địa chỉ thành công',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};


