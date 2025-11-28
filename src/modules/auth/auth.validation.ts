import { z } from 'zod';

// Validation schemas cho module Auth
export const registerSchema = z.object({
  email: z.string().email('Email không hợp lệ').optional(),
  phone: z.string().regex(/^\d{11}$/, 'Số điện thoại phải có 11 chữ số').optional(),
  password: z.string().min(8, 'Mật khẩu phải có ít nhất 8 ký tự'),
}).refine(data => data.email || data.phone, {
  message: 'Phải cung cấp email hoặc số điện thoại',
});

export const loginSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().regex(/^\d{11}$/).optional(),
  password: z.string().min(1, 'Mật khẩu không được để trống'),
}).refine(data => data.email || data.phone, {
  message: 'Phải cung cấp email hoặc số điện thoại',
});

export const resetPasswordSchema = z.object({
  code: z.string().min(1, 'Mã xác thực không được để trống'),
  email: z.string().email().optional(),
  phone: z.string().regex(/^\d{11}$/).optional(),
  newPassword: z.string().min(8, 'Mật khẩu mới phải có ít nhất 8 ký tự'),
  confirmPassword: z.string().min(8, 'Xác nhận mật khẩu phải có ít nhất 8 ký tự'),
}).refine(data => data.email || data.phone, {
  message: 'Phải cung cấp email hoặc số điện thoại',
}).refine(data => data.newPassword === data.confirmPassword, {
  message: 'Xác nhận mật khẩu không khớp',
  path: ['confirmPassword'],
});

export const updateProfileSchema = z.object({
  full_name: z.string().min(1, 'Họ tên không được để trống').optional(),
  email: z.string().email('Email không hợp lệ').optional(),
  phone: z.string().regex(/^\d{11}$/, 'Số điện thoại phải có 11 chữ số').optional(),
}).refine(data => data.email || data.phone || data.full_name, {
  message: 'Phải cung cấp ít nhất một trường để cập nhật',
});

export const verifyPasswordSchema = z.object({
  password: z.string().min(1, 'Mật khẩu không được để trống'),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token không được để trống'),
});

export const deleteAccountSchema = z.object({
  password: z.string().min(1, 'Mật khẩu không được để trống'),
});

