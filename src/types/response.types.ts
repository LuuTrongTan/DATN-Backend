/**
 * Response Types cho các modules
 */

// Auth Module Response Types
export interface AuthResponse {
  user: {
    id: string; // UUID từ database
    email?: string;
    phone?: string;
    full_name?: string;
    role: string;
    email_verified?: boolean;
    phone_verified?: boolean;
    created_at?: string;
  };
}

export interface LoginResponse extends AuthResponse {
  token: string;
  refreshToken: string;
}

export interface RefreshTokenResponse {
  token: string;
  refreshToken: string;
}

// Common Response Types
export interface PaginationParams {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ErrorDetails {
  code: string;
  details?: any;
  suggestion?: string;
}

