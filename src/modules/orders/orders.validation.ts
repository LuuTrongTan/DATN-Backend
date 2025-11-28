import { z } from 'zod';

// Validation schemas cho module Orders
export const orderSchema = z.object({
  shipping_address: z.string().min(1, 'Địa chỉ giao hàng không được để trống'),
  payment_method: z.enum(['online', 'cod']),
  notes: z.string().optional(),
});

