import { z } from 'zod';

// Validation schemas cho module Orders
export const orderSchema = z.object({
  shipping_address: z.string().min(1, 'Địa chỉ giao hàng không được để trống'),
  payment_method: z.enum(['online', 'cod']),
  shipping_fee: z.number().nonnegative().optional(),
  notes: z.string().optional(),
  coupon_code: z.string().optional(),
  address_id: z.number().int().positive().optional(),
});

