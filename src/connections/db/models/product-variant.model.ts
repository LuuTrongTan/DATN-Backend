// ProductVariant Model - Based on database_schema.dbml
// Hỗ trợ nhiều thuộc tính kết hợp: {"Size": "M", "Color": "Đỏ", "Material": "Cotton"}

export interface VariantAttributeDefinition {
  id: number;
  product_id: number;
  attribute_name: string; // "Size", "Color", "Material", "Style"...
  display_name: string; // "Kích cỡ", "Màu sắc", "Chất liệu"...
  display_order: number;
  is_required: boolean;
  created_at: Date;
}

export interface VariantAttributeValue {
  id: number;
  definition_id: number;
  value: string; // "M", "L", "XL" hoặc "Đỏ", "Xanh", "Vàng"...
  display_order: number;
  created_at: Date;
}

export interface ProductVariant {
  id: number;
  product_id: number; // ON DELETE CASCADE
  sku: string | null; // unique - SKU riêng cho từng biến thể
  variant_attributes: Record<string, string>; // JSONB: {"Size": "M", "Color": "Đỏ", "Material": "Cotton"}
  price_adjustment: number; // default: 0 - Điều chỉnh giá so với giá gốc (VND)
  stock_quantity: number; // default: 0 - Số lượng tồn kho của biến thể này
  image_url: string | null; // Ảnh riêng cho biến thể
  is_active: boolean; // default: true - Ẩn/hiện biến thể
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null; // Soft delete
}

export interface CreateVariantAttributeDefinitionInput {
  product_id: number;
  attribute_name: string; // "Size", "Color", "Material"...
  display_name: string; // "Kích cỡ", "Màu sắc", "Chất liệu"...
  display_order?: number;
  is_required?: boolean;
}

export interface CreateVariantAttributeValueInput {
  definition_id: number;
  value: string; // "M", "L", "XL" hoặc "Đỏ", "Xanh"...
  display_order?: number;
}

export interface CreateProductVariantInput {
  product_id: number;
  sku?: string | null; // optional - unique
  variant_attributes: Record<string, string>; // REQUIRED - {"Size": "M", "Color": "Đỏ"}
  price_adjustment?: number; // default: 0
  stock_quantity?: number; // default: 0
  image_url?: string | null;
  is_active?: boolean; // default: true
}

export interface UpdateProductVariantInput {
  sku?: string | null;
  variant_attributes?: Record<string, string>; // Cập nhật toàn bộ attributes
  price_adjustment?: number;
  stock_quantity?: number;
  image_url?: string | null;
  is_active?: boolean;
}

