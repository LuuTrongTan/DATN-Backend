import { z } from 'zod';

export const createCouponSchema = z.object({
  code: z.string().min(3, 'Mã giảm giá phải có ít nhất 3 ký tự').max(50, 'Mã giảm giá không được quá 50 ký tự'),
  name: z.string().min(1, 'Tên mã giảm giá không được để trống'),
  description: z.string().optional(),
  discount_type: z.enum(['percentage', 'fixed']),
  discount_value: z.number().positive('Giá trị giảm giá phải lớn hơn 0'),
  min_order_amount: z.number().nonnegative().optional().default(0),
  max_discount_amount: z.number().positive().optional(),
  usage_limit: z.number().int().positive().optional(),
  user_limit: z.number().int().positive().optional().default(1),
  start_date: z.string().datetime(),
  end_date: z.string().datetime(),
  applicable_to: z.enum(['all', 'category', 'product']).optional().default('all'),
  category_id: z.number().int().positive().optional(),
  product_id: z.number().int().positive().optional(),
}).refine((data) => {
  if (data.applicable_to === 'category' && !data.category_id) {
    return false;
  }
  if (data.applicable_to === 'product' && !data.product_id) {
    return false;
  }
  return true;
}, {
  message: 'Phải chọn category_id hoặc product_id khi applicable_to là category hoặc product',
});

export const updateCouponSchema = createCouponSchema.partial().omit({ code: true });

export const applyCouponSchema = z.object({
  code: z.string().min(1, 'Mã giảm giá không được để trống'),
  order_amount: z.number().positive('Tổng tiền đơn hàng phải lớn hơn 0'),
  product_ids: z.array(z.number().int().positive()).optional(),
  category_ids: z.array(z.number().int().positive()).optional(),
});

