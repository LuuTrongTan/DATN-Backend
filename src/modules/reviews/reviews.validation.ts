import { z } from 'zod';

// Validation schemas cho module Reviews
export const reviewSchema = z.object({
  product_id: z.number().int().positive(),
  order_id: z.number().int().positive(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().min(10, 'Đánh giá phải có ít nhất 10 ký tự'),
  image_urls: z.array(z.string().url()).optional(),
  video_url: z.string().url().optional(),
});

