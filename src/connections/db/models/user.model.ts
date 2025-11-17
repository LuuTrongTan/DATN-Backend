// User Model - Based on migration 001_create_users_table

export type UserRole = 'customer' | 'staff' | 'admin';

export interface User {
  id: number;
  email: string | null;
  phone: string | null;
  password_hash: string;
  full_name: string | null;
  is_verified: boolean;
  is_active: boolean;
  is_banned: boolean;
  role: UserRole;
  created_at: Date;
  updated_at: Date;
}

export interface CreateUserInput {
  email?: string | null;
  phone?: string | null;
  password_hash: string;
  full_name?: string | null;
  role?: UserRole;
  is_verified?: boolean;
}

export interface UpdateUserInput {
  email?: string | null;
  phone?: string | null;
  full_name?: string | null;
  password_hash?: string;
  is_verified?: boolean;
  is_active?: boolean;
  is_banned?: boolean;
  role?: UserRole;
}

