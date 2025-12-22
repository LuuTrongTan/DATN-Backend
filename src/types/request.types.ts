import { Request } from 'express';

/**
 * Request Types và Interfaces cho toàn hệ thống
 */

/**
 * Auth Request - Request với thông tin user đã authenticated
 */
export interface AuthRequest extends Request {
  user?: {
    id: string; // UUID từ database
    email?: string;
    phone?: string;
    role: string;
  };
}

/**
 * Pagination Query Parameters
 */
export interface PaginationQuery {
  page?: number;
  limit?: number;
}

/**
 * Search Query Parameters
 */
export interface SearchQuery extends PaginationQuery {
  q?: string; // Query string for search
}

/**
 * Sort Query Parameters
 */
export interface SortQuery {
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Filter Query Parameters (có thể extend thêm cho từng module)
 */
export interface FilterQuery {
  category_id?: number;
  min_price?: number;
  max_price?: number;
  status?: string;
}

/**
 * Common Query Parameters (kết hợp pagination, search, sort, filter)
 */
export interface CommonQueryParams extends PaginationQuery, SearchQuery, SortQuery, FilterQuery {}

