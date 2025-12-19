// Product Model - Based on migration 004_create_products_table

export interface Product {
  id: number;
  category_id: number | null;
  name: string;
  description: string | null;
  price: number; // DECIMAL(10, 2)
  stock_quantity: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CreateProductInput {
  category_id: number;
  name: string;
  description?: string | null;
  price: number;
  stock_quantity: number;
  video_url?: string | null;
  is_active?: boolean;
}

export interface UpdateProductInput {
  category_id?: number;
  name?: string;
  description?: string | null;
  price?: number;
  stock_quantity?: number;
  video_url?: string | null;
  is_active?: boolean;
}

