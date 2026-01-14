import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../connections';
import { appConfig } from '../connections/config/app.config';
import { AuthRequest } from '../types/request.types';
import { ResponseHandler } from '../utils/response';
import { logger } from '../utils/logging';
import { USER_STATUS } from '../constants';

const isValidUuid = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  // Định dạng UUID v4 cơ bản, đủ để tránh các giá trị như "1"
  const uuidRegex =
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
  return uuidRegex.test(value);
};

const resolveUserFromToken = async (token: string) => {
  const decoded = jwt.verify(token, appConfig.jwtSecret) as any;

  // Bảo vệ khi userId trong token không đúng định dạng UUID
  if (!isValidUuid(decoded.userId)) {
    logger.warn('[Auth] Invalid userId format in token', {
      userId: decoded.userId,
    });
    throw new Error('Token không hợp lệ');
  }

  const result = await pool.query(
    'SELECT id, email, phone, role, status FROM users WHERE id = $1',
    [decoded.userId]
  );

  if (result.rows.length === 0) {
    throw new Error('Người dùng không tồn tại');
  }

  const user = result.rows[0];

  if (user.status !== USER_STATUS.ACTIVE) {
    throw new Error('Tài khoản đã bị khóa');
  }

  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    role: user.role,
  };
};

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return ResponseHandler.unauthorized(res, 'Token không được cung cấp');
    }

    req.user = await resolveUserFromToken(token);

    next();
  } catch (error: any) {
    // Không trả message lỗi chi tiết từ database cho client
    return ResponseHandler.unauthorized(res, 'Token không hợp lệ');
  }
};

// Xác thực không bắt buộc: nếu có token thì gán req.user, không có thì bỏ qua
export const optionalAuthenticate = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return next();
    }

    req.user = await resolveUserFromToken(token);
  } catch {
    // Nếu token lỗi thì coi như chưa đăng nhập, không chặn request public
    req.user = undefined;
  }

  next();
};

export const requireRole = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return ResponseHandler.unauthorized(res, 'Chưa xác thực');
    }

    if (!roles.includes(req.user.role)) {
      return ResponseHandler.forbidden(res, 'Không có quyền truy cập');
    }

    next();
  };
};

// Alias for requireRole to match existing usage
export const authorize = requireRole;
