import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../connections';
import { appConfig } from '../connections/config/app.config';
import { AuthRequest } from '../types/request.types';

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

    const decoded = jwt.verify(token, appConfig.jwtSecret) as any;
    
    // Verify user still exists and is active
    const result = await pool.query(
      'SELECT id, email, phone, role, is_active, is_banned FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Người dùng không tồn tại' });
    }

    const user = result.rows[0];

    if (!user.is_active || user.is_banned) {
      return res.status(403).json({ message: 'Tài khoản đã bị khóa' });
    }

    req.user = {
      id: user.id,
      email: user.email,
      phone: user.phone,
      role: user.role,
    };

    next();
  } catch (error) {
    return res.status(401).json({ message: 'Token không hợp lệ' });
  }
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

