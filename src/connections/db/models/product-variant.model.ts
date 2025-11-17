// ProductVariant Model - Based on migration 005_create_product_variants_table

export interface ProductVariant {
  id: number;
  product_id: number;
  variant_type: string; // e.g., 'size', 'color'
  variant_value: string; // e.g., 'XL', 'Red'
  price_adjustment: number; // DECIMAL(10, 2)
  stock_quantity: number;
  created_at: Date;
}

export interface CreateProductVariantInput {
  product_id: number;
  variant_type: string;
  variant_value: string;
  price_adjustment?: number;
  stock_quantity?: number;
}

export interface UpdateProductVariantInput {
  variant_type?: string;
  variant_value?: string;
  price_adjustment?: number;
  stock_quantity?: number;
}

