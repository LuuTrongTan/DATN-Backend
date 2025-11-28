import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logging';
import { ResponseHandler } from '../utils/response';

/**
 * Rate Limiting Store (In-memory)
 * TODO: Có thể chuyển sang Redis cho production
 */
interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

const store: RateLimitStore = {};

/**
 * Clear expired entries periodically
 */
setInterval(() => {
  const now = Date.now();
  Object.keys(store).forEach((key) => {
    if (store[key].resetTime < now) {
      delete store[key];
    }
  });
}, 60000); // Clean up every minute

/**
 * Get client identifier for rate limiting
 */
const getClientId = (req: Request): string => {
  // Prefer IP address, fallback to user ID if authenticated
  return req.user?.id?.toString() || req.ip || 'unknown';
};

/**
 * Rate Limiting Middleware
 */
export const rateLimit = (
  windowMs: number = 15 * 60 * 1000, // 15 minutes default
  maxRequests: number = 5, // 5 requests per window
  message?: string
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const clientId = getClientId(req);
    const now = Date.now();
    const key = `${req.path}:${clientId}`;

    // Get or create rate limit entry
    let entry = store[key];

    if (!entry || entry.resetTime < now) {
      // Create new entry or reset expired entry
      entry = {
        count: 0,
        resetTime: now + windowMs,
      };
      store[key] = entry;
    }

    // Increment request count
    entry.count++;

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', maxRequests.toString());
    res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - entry.count).toString());
    res.setHeader('X-RateLimit-Reset', new Date(entry.resetTime).toISOString());

    // Check if limit exceeded
    if (entry.count > maxRequests) {
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);

      logger.warn('[Rate Limit Exceeded]', {
        clientId,
        path: req.path,
        count: entry.count,
        limit: maxRequests,
      });

      return ResponseHandler.tooManyRequests(
        res,
        message || `Quá nhiều yêu cầu. Vui lòng thử lại sau ${retryAfter} giây.`,
        retryAfter
      );
    }

    next();
  };
};

/**
 * Predefined rate limiters
 */
export const rateLimiters = {
  // Strict rate limiter for login/register (5 requests per 15 minutes)
  auth: rateLimit(15 * 60 * 1000, 5, 'Quá nhiều lần thử đăng nhập. Vui lòng thử lại sau 15 phút.'),

  // Moderate rate limiter for general endpoints (20 requests per minute)
  general: rateLimit(60 * 1000, 20, 'Quá nhiều yêu cầu. Vui lòng thử lại sau.'),

  // Strict rate limiter for verification codes (3 requests per minute)
  verification: rateLimit(60 * 1000, 3, 'Quá nhiều yêu cầu mã xác thực. Vui lòng đợi 1 phút.'),
};

