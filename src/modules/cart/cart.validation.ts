import { z } from 'zod';

// Validation schemas cho module Cart
export const cartItemSchema = z.object({
  product_id: z.number().int().positive(),
  variant_id: z.number().int().positive().nullable().optional(), // Cho phép null hoặc undefined
  quantity: z.number().int().positive('Số lượng phải lớn hơn 0'),
});

