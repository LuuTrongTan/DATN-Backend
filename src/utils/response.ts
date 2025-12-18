import { Response } from 'express';
import { logger } from './logging';

/**
 * Chuẩn Response Interface cho toàn hệ thống
 */
export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: {
    code?: string;
    details?: any;
  };
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  meta?: Record<string, any>;
}

/**
 * Response Handler - Quản lý response chung cho toàn hệ thống
 */
export class ResponseHandler {
  /**
   * Success Response
   */
  static success<T>(
    res: Response,
    data?: T,
    message: string = 'Thành công',
    statusCode: number = 200,
    meta?: Record<string, any>
  ): Response {
    const response: ApiResponse<T> = {
      success: true,
      message,
      data,
      ...(meta && { meta }),
    };

    return res.status(statusCode).json(response);
  }

  /**
   * Created Response (201)
   */
  static created<T>(
    res: Response,
    data?: T,
    message: string = 'Tạo thành công',
    meta?: Record<string, any>
  ): Response {
    return this.success(res, data, message, 201, meta);
  }

  /**
   * Error Response
   */
  static error(
    res: Response,
    message: string = 'Có lỗi xảy ra',
    statusCode: number = 400,
    error?: {
      code?: string;
      details?: any;
    },
    meta?: Record<string, any>
  ): Response {
    const response: ApiResponse = {
      success: false,
      message,
      error,
      ...(meta && { meta }),
    };

    // Log error
    logger.error(`[API Error] ${message}`, {
      statusCode,
      error,
      meta,
    });

    return res.status(statusCode).json(response);
  }

  /**
   * Bad Request Response (400)
   */
  static badRequest(
    res: Response,
    message: string = 'Yêu cầu không hợp lệ',
    details?: any
  ): Response {
    return this.error(
      res,
      message,
      400,
      {
        code: 'BAD_REQUEST',
        details,
      }
    );
  }

  /**
   * Validation Error Response
   */
  static validationError(
    res: Response,
    errors: any[],
    message: string = 'Dữ liệu không hợp lệ'
  ): Response {
    return this.error(
      res,
      message,
      400,
      {
        code: 'VALIDATION_ERROR',
        details: errors,
      }
    );
  }

  /**
   * Unauthorized Response
   */
  static unauthorized(
    res: Response,
    message: string = 'Không có quyền truy cập'
  ): Response {
    return this.error(res, message, 401, {
      code: 'UNAUTHORIZED',
    });
  }

  /**
   * Forbidden Response
   */
  static forbidden(
    res: Response,
    message: string = 'Bị cấm truy cập'
  ): Response {
    return this.error(res, message, 403, {
      code: 'FORBIDDEN',
    });
  }

  /**
   * Not Found Response
   */
  static notFound(
    res: Response,
    message: string = 'Không tìm thấy'
  ): Response {
    return this.error(res, message, 404, {
      code: 'NOT_FOUND',
    });
  }

  /**
   * Conflict Response (409)
   */
  static conflict(
    res: Response,
    message: string = 'Dữ liệu đã tồn tại',
    details?: any
  ): Response {
    return this.error(res, message, 409, {
      code: 'CONFLICT',
      details,
    });
  }

  /**
   * Too Many Requests Response (429)
   */
  static tooManyRequests(
    res: Response,
    message: string = 'Quá nhiều yêu cầu',
    retryAfter?: number
  ): Response {
    return this.error(
      res,
      message,
      429,
      {
        code: 'TOO_MANY_REQUESTS',
        details: retryAfter ? { retryAfter } : undefined,
      }
    );
  }

  /**
   * Internal Server Error Response
   */
  static internalError(
    res: Response,
    message: string = 'Lỗi hệ thống',
    error?: any
  ): Response {
    // Log detailed error
    logger.error('[Internal Server Error]', {
      message,
      error: error?.stack || error,
    });

    return this.error(res, message, 500, {
      code: 'INTERNAL_ERROR',
    });
  }

  /**
   * Paginated Response
   */
  static paginated<T>(
    res: Response,
    data: T[],
    pagination: {
      page: number;
      limit: number;
      total: number;
    },
    message: string = 'Thành công'
  ): Response {
    const response: ApiResponse<T[]> = {
      success: true,
      message,
      data,
      pagination: {
        ...pagination,
        totalPages: Math.ceil(pagination.total / pagination.limit),
      },
    };

    return res.status(200).json(response);
  }
}

