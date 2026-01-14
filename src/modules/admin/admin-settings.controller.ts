import { Response } from 'express';
import { AuthRequest } from '../../types/request.types';
import { pool } from '../../connections';
import { ResponseHandler } from '../../utils/response';
import { logger } from '../../utils/logging';

interface PhoneFirebaseConfig {
  enabled: boolean;
}

const PHONE_FIREBASE_CONFIG_KEY = 'auth.require_firebase_for_phone_registration';

const getBoolean = (value: any, defaultValue: boolean): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
  }
  return defaultValue;
};

export const getPhoneFirebaseRegistrationConfig = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const result = await pool.query(
      'SELECT value FROM app_settings WHERE key = $1 LIMIT 1',
      [PHONE_FIREBASE_CONFIG_KEY]
    );

    let config: PhoneFirebaseConfig = { enabled: true };

    if (result.rows.length > 0) {
      const row = result.rows[0];
      const value = row.value || {};
      config = {
        enabled: getBoolean(value.enabled, true),
      };
    }

    return ResponseHandler.success(
      res,
      config,
      'Lấy cấu hình đăng ký bằng số điện thoại thành công'
    );
  } catch (error: any) {
    logger.error(
      '[AdminSettings] Error getting phone Firebase registration config',
      error instanceof Error ? error : new Error(String(error)),
      { ip: req.ip }
    );
    return ResponseHandler.internalError(
      res,
      'Lỗi khi lấy cấu hình đăng ký bằng số điện thoại',
      error
    );
  }
};

export const updatePhoneFirebaseRegistrationConfig = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const { enabled } = req.body as Partial<PhoneFirebaseConfig>;

    if (enabled === undefined || typeof enabled !== 'boolean') {
      return ResponseHandler.validationError(res, [
        {
          path: ['enabled'],
          message: 'Trường enabled (boolean) là bắt buộc',
        },
      ] as any);
    }

    const value: PhoneFirebaseConfig = { enabled };

    await pool.query(
      `
        INSERT INTO app_settings (key, value, description)
        VALUES ($1, $2, $3)
        ON CONFLICT (key) DO UPDATE
        SET value = EXCLUDED.value
      `,
      [
        PHONE_FIREBASE_CONFIG_KEY,
        value,
        'Bật/tắt bắt buộc xác thực Firebase khi đăng ký tài khoản bằng số điện thoại',
      ]
    );

    logger.info('[AdminSettings] Updated phone Firebase registration config', {
      enabled,
      userId: req.user?.id,
      ip: req.ip,
    });

    return ResponseHandler.success(
      res,
      value,
      'Cập nhật cấu hình đăng ký bằng số điện thoại thành công'
    );
  } catch (error: any) {
    logger.error(
      '[AdminSettings] Error updating phone Firebase registration config',
      error instanceof Error ? error : new Error(String(error)),
      { ip: req.ip }
    );
    return ResponseHandler.internalError(
      res,
      'Lỗi khi cập nhật cấu hình đăng ký bằng số điện thoại',
      error
    );
  }
};

