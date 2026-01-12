import { Request, Response, NextFunction } from 'express';
import { appConfig } from '../connections/config/app.config';
import { logger } from '../utils/logging';
import { ResponseHandler } from '../utils/response';

const SENSITIVE_KEYS = [
  'password',
  'new_password',
  'confirm_password',
  'token',
  'refreshToken',
  'access_token',
  'code',
  'otp',
];

const maskSensitive = (value: any): any => {
  if (Array.isArray(value)) {
    return value.map(maskSensitive);
  }
  if (value && typeof value === 'object') {
    return Object.keys(value).reduce((acc: any, key) => {
      if (SENSITIVE_KEYS.includes(key)) {
        acc[key] = '***';
      } else {
        acc[key] = maskSensitive(value[key]);
      }
      return acc;
    }, Array.isArray(value) ? [] : {});
  }
  return value;
};

export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Log error với thông tin chi tiết
  logger.error('[Error Handler]', {
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    body: maskSensitive(req.body),
    params: maskSensitive(req.params),
    query: maskSensitive(req.query),
  });

  // Zod validation errors
  if (err.name === 'ZodError') {
    return ResponseHandler.validationError(res, err.errors);
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return ResponseHandler.unauthorized(res, 'Token không hợp lệ');
  }

  if (err.name === 'TokenExpiredError') {
    return ResponseHandler.unauthorized(res, 'Token đã hết hạn');
  }

  // Database errors
  if (err.code === '23505') { // Unique violation
    return ResponseHandler.conflict(res, 'Dữ liệu đã tồn tại');
  }

  if (err.code === '23503') { // Foreign key violation
    return ResponseHandler.error(res, 'Dữ liệu không hợp lệ', 400, {
      code: 'FOREIGN_KEY_VIOLATION',
    });
  }

  // Default error
  const statusCode = err.status || err.statusCode || 500;
  const message = err.message || 'Lỗi hệ thống';

  return ResponseHandler.error(
    res,
    message,
    statusCode,
    {
      code: err.code || 'INTERNAL_ERROR',
      details: appConfig.nodeEnv === 'development' ? err.stack : undefined,
    }
  );
};

export const notFoundHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  logger.warn('[Not Found]', {
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
  });

  ResponseHandler.notFound(res, 'Route không tồn tại');
};

