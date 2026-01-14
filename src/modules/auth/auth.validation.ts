import { z } from 'zod';

// Validation schemas cho module Auth
// UC-01: Đăng ký chỉ bằng số điện thoại
// - Khi cấu hình yêu cầu Firebase: idToken sẽ được kiểm tra ở controller
// - Khi tắt yêu cầu Firebase: idToken có thể bỏ qua
export const registerSchema = z.object({
  phone: z.string().regex(/^\d{10}$/, 'Số điện thoại phải có 10 chữ số'),
  password: z.string().min(8, 'Mật khẩu phải có ít nhất 8 ký tự'),
  idToken: z.string().optional(),
});

// Schema để thêm email recovery vào tài khoản
export const addRecoveryEmailSchema = z.object({
  email: z.string().email('Email không hợp lệ'),
});

export const loginSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().regex(/^\d{10}$/).optional(),
  password: z.string().min(1, 'Mật khẩu không được để trống'),
}).refine(data => data.email || data.phone, {
  message: 'Phải cung cấp email hoặc số điện thoại',
});

// Schema cho quên mật khẩu
// Nếu dùng phone: phải có idToken + newPassword (Firebase Phone Auth - reset ngay)
// Nếu dùng email: chỉ cần email (gửi code OTP)
export const forgotPasswordSchema = z.object({
  email: z.string().email('Email không hợp lệ').optional(),
  phone: z.string().regex(/^\d{10}$/, 'Số điện thoại phải có 10 chữ số').optional(),
  idToken: z.string().optional(), // Bắt buộc nếu dùng phone
  newPassword: z.string().min(8, 'Mật khẩu mới phải có ít nhất 8 ký tự').optional(),
  confirmPassword: z.string().min(8, 'Xác nhận mật khẩu phải có ít nhất 8 ký tự').optional(),
}).refine(data => data.email || data.phone, {
  message: 'Phải cung cấp email hoặc số điện thoại',
}).refine(data => {
  // Nếu dùng phone thì phải có idToken và newPassword
  if (data.phone && !data.idToken) {
    return false;
  }
  if (data.phone && !data.newPassword) {
    return false;
  }
  return true;
}, {
  message: 'Khi dùng số điện thoại, vui lòng cung cấp Firebase ID token và mật khẩu mới',
  path: ['phone'],
}).refine(data => {
  // Nếu có newPassword thì phải có confirmPassword và khớp nhau
  if (data.newPassword && (!data.confirmPassword || data.newPassword !== data.confirmPassword)) {
    return false;
  }
  return true;
}, {
  message: 'Xác nhận mật khẩu không khớp',
  path: ['confirmPassword'],
});

// Schema cho reset password với code OTP (chỉ dùng cho email)
export const resetPasswordSchema = z.object({
  code: z.string().min(1, 'Mã xác thực không được để trống'),
  email: z.string().email('Email không hợp lệ'),
  newPassword: z.string().min(8, 'Mật khẩu mới phải có ít nhất 8 ký tự'),
  confirmPassword: z.string().min(8, 'Xác nhận mật khẩu phải có ít nhất 8 ký tự'),
}).refine(data => data.newPassword === data.confirmPassword, {
  message: 'Xác nhận mật khẩu không khớp',
  path: ['confirmPassword'],
});

export const updateProfileSchema = z.object({
  full_name: z.string().min(1, 'Họ tên không được để trống').optional(),
  email: z.string().email('Email không hợp lệ').optional(),
  phone: z.string().regex(/^\d{10}$/, 'Số điện thoại phải có 10 chữ số').optional(),
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


