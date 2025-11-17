import { z } from 'zod';

// Validation schemas
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

export const productSchema = z.object({
  category_id: z.number().int().positive(),
  name: z.string().min(1, 'Tên sản phẩm không được để trống'),
  description: z.string().optional(),
  price: z.number().positive('Giá phải lớn hơn 0'),
  stock_quantity: z.number().int().nonnegative(),
  image_urls: z.array(z.string().url()).min(1, 'Phải có ít nhất 1 hình ảnh'),
  video_url: z.string().url().optional(),
});

export const cartItemSchema = z.object({
  product_id: z.number().int().positive(),
  variant_id: z.number().int().positive().optional(),
  quantity: z.number().int().positive('Số lượng phải lớn hơn 0'),
});

export const orderSchema = z.object({
  shipping_address: z.string().min(1, 'Địa chỉ giao hàng không được để trống'),
  payment_method: z.enum(['online', 'cod']),
  notes: z.string().optional(),
});

export const reviewSchema = z.object({
  product_id: z.number().int().positive(),
  order_id: z.number().int().positive(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().min(10, 'Đánh giá phải có ít nhất 10 ký tự'),
  image_urls: z.array(z.string().url()).optional(),
  video_url: z.string().url().optional(),
});
