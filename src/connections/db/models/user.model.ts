// User Model - Based on migration 001_create_users_table

export type UserRole = 'customer' | 'staff' | 'admin';
export type UserStatus = 'active' | 'banned' | 'deleted';

export interface User {
  id: number;
  email: string | null;
  phone: string | null;
  password_hash: string;
  full_name: string | null;
  phone_verified: boolean;
  email_verified: boolean;
  status: UserStatus;
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
  phone_verified?: boolean;
  email_verified?: boolean;
  status?: UserStatus;
}

export interface UpdateUserInput {
  email?: string | null;
  phone?: string | null;
  full_name?: string | null;
  password_hash?: string;
  phone_verified?: boolean;
  email_verified?: boolean;
  status?: UserStatus;
  role?: UserRole;
}

