import { z } from 'zod';

// Schema tạo định nghĩa thuộc tính biến thể (Size, Color, Material...)
export const createAttributeDefinitionSchema = z.object({
  attribute_name: z.string().min(1, 'Tên thuộc tính không được để trống').max(50),
  display_name: z.string().min(1, 'Tên hiển thị không được để trống').max(100),
  display_order: z.number().int().nonnegative().optional().default(0),
  is_required: z.boolean().optional().default(false),
});

// Schema tạo giá trị thuộc tính (M, L, XL hoặc Đỏ, Xanh...)
export const createAttributeValueSchema = z.object({
  value: z.string().min(1, 'Giá trị không được để trống').max(100),
  display_order: z.number().int().nonnegative().optional().default(0),
});

// Schema tạo biến thể - variant_attributes là object với key-value
// Ví dụ: {"Size": "M", "Color": "Đỏ"}
export const createVariantSchema = z.object({
  sku: z.string().max(100).optional().nullable(),
  variant_attributes: z
    .record(z.string(), z.string())
    .refine(
      (attrs) => Object.keys(attrs).length > 0,
      'Phải có ít nhất một thuộc tính biến thể'
    )
    .refine(
      (attrs) => Object.values(attrs).every((v) => v && v.trim().length > 0),
      'Tất cả giá trị thuộc tính không được để trống'
    ),
  price_adjustment: z.number().int().optional().default(0),
  stock_quantity: z.number().int().nonnegative().optional().default(0),
  image_url: z.string().max(500).url().optional().nullable(),
  image_urls: z.union([z.array(z.string()), z.string()]).optional(), // Cho phép array hoặc string
  is_active: z.boolean().optional().default(true),
});

// Schema cập nhật biến thể
export const updateVariantSchema = z.object({
  sku: z.string().max(100).optional().nullable(),
  variant_attributes: z
    .record(z.string(), z.string())
    .refine(
      (attrs) => Object.keys(attrs).length > 0,
      'Phải có ít nhất một thuộc tính biến thể'
    )
    .refine(
      (attrs) => Object.values(attrs).every((v) => v && v.trim().length > 0),
      'Tất cả giá trị thuộc tính không được để trống'
    )
    .optional(),
  price_adjustment: z.number().int().optional(),
  stock_quantity: z.number().int().nonnegative().optional(),
  image_url: z.string().max(500).url().optional().nullable(),
  image_urls: z.union([z.array(z.string()), z.string()]).optional(), // Cho phép array hoặc string
  is_active: z.boolean().optional(),
});

