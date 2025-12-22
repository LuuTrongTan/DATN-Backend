// ProductVariant Model - Based on database_schema.dbml

export interface ProductVariant {
  id: number;
  product_id: number; // ON DELETE CASCADE
  sku: string; // unique - SKU riêng cho từng biến thể
  variant_type: string; // Loại biến thể: Size, Color, Material, Style...
  variant_value: string; // Giá trị: M, L, XL hoặc Đỏ, Xanh...
  price_adjustment: number; // default: 0 - Điều chỉnh giá so với giá gốc (VND)
  stock_quantity: number; // default: 0 - Số lượng tồn kho của biến thể này
  image_url: string | null; // Ảnh riêng cho biến thể
  is_active: boolean; // default: true - Ẩn/hiện biến thể
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null; // Soft delete
}

export interface CreateProductVariantInput {
  product_id: number;
  sku: string; // REQUIRED - unique
  variant_type: string;
  variant_value: string;
  price_adjustment?: number; // default: 0
  stock_quantity?: number; // default: 0
  image_url?: string | null;
  is_active?: boolean; // default: true
}

export interface UpdateProductVariantInput {
  sku?: string;
  variant_type?: string;
  variant_value?: string;
  price_adjustment?: number;
  stock_quantity?: number;
  image_url?: string | null;
  is_active?: boolean;
}

