import { z } from 'zod';

// Schema cho refund item
const refundItemSchema = z.object({
  order_item_id: z.number().int().positive(),
  quantity: z.number().int().positive('Số lượng phải lớn hơn 0'),
  reason: z.string().optional(),
});

// Schema cho create refund
export const createRefundSchema = z.object({
  order_id: z.number().int().positive('Order ID không hợp lệ'),
  type: z.enum(['refund', 'return', 'exchange'], {
    errorMap: () => ({ message: 'Loại refund phải là: refund, return hoặc exchange' }),
  }),
  reason: z.string().min(1, 'Lý do không được để trống'),
  items: z.array(refundItemSchema).min(1, 'Phải có ít nhất một sản phẩm để refund'),
});

// Schema cho update refund status
export const updateRefundStatusSchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'processing', 'completed', 'cancelled'], {
    errorMap: () => ({ message: 'Status không hợp lệ' }),
  }),
  admin_notes: z.string().optional(),
  refund_amount: z.number().nonnegative('Số tiền hoàn phải lớn hơn hoặc bằng 0').optional(),
});
