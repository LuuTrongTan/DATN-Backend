import { z } from 'zod';

// Schema tạo biến thể
export const createVariantSchema = z.object({
  variant_type: z.string().min(1, 'Loại biến thể không được để trống'),
  variant_value: z.string().min(1, 'Giá trị biến thể không được để trống'),
  price_adjustment: z.number().int().optional(),
  stock_quantity: z.number().int().nonnegative().optional(),
  image_urls: z.union([z.array(z.string()), z.string()]).optional(), // Cho phép array hoặc string
});

// Schema cập nhật biến thể
export const updateVariantSchema = z.object({
  variant_type: z.string().min(1).optional(),
  variant_value: z.string().min(1).optional(),
  price_adjustment: z.number().int().optional(),
  stock_quantity: z.number().int().nonnegative().optional(),
  image_urls: z.union([z.array(z.string()), z.string()]).optional(), // Cho phép array hoặc string
});

