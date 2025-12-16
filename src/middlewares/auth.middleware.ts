import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../connections';
import { appConfig } from '../connections/config/app.config';
import { AuthRequest } from '../types/request.types';

const resolveUserFromToken = async (token: string) => {
  const decoded = jwt.verify(token, appConfig.jwtSecret) as any;

  const result = await pool.query(
    'SELECT id, email, phone, role, is_active, is_banned FROM users WHERE id = $1',
    [decoded.userId]
  );

  if (result.rows.length === 0) {
    throw new Error('Người dùng không tồn tại');
  }

  const user = result.rows[0];

  if (!user.is_active || user.is_banned) {
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
      return res.status(401).json({ message: 'Token không được cung cấp' });
    }

    req.user = await resolveUserFromToken(token);

    next();
  } catch (error: any) {
    return res.status(401).json({ message: error.message || 'Token không hợp lệ' });
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
      return res.status(401).json({ message: 'Chưa xác thực' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Không có quyền truy cập' });
    }

    next();
  };
};

