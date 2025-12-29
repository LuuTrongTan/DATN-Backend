import { z } from 'zod';
import { PAYMENT_METHOD } from '../../constants';

// Validation schemas cho module Orders
export const orderSchema = z.object({
  shipping_address: z.string().min(1, 'Địa chỉ giao hàng không được để trống'),
  payment_method: z.enum([PAYMENT_METHOD.ONLINE, PAYMENT_METHOD.COD] as [string, ...string[]]),
  shipping_fee: z.number().nonnegative().optional(),
  discount_amount: z.number().nonnegative().optional(),
  tax_amount: z.number().nonnegative().optional(),
  notes: z.string().optional(),
  address_id: z.number().int().positive().optional(),
});

