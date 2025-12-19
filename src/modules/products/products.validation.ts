import { z } from 'zod';

// Validation schemas cho module Products
export const productSchema = z.object({
  category_id: z.number().int().positive(),
  name: z.string().min(1, 'Tên sản phẩm không được để trống'),
  description: z.string().optional(),
  price: z.number().positive('Giá phải lớn hơn 0'),
  stock_quantity: z.number().int().nonnegative(),
  video_url: z.string().url().optional(),
});

