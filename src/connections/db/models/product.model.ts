// Product Model - Based on database_schema.dbml

export interface Product {
  id: number;
  category_id: number | null;
  sku: string; // unique
  name: string;
  description: string | null;
  price: number; // integer (VND)
  stock_quantity: number; // default: 0
  brand: string | null;
  view_count: number; // default: 0
  sold_count: number; // default: 0
  is_active: boolean; // default: true
  search_vector: string | null; // Full-text search vector
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null; // Soft delete
}

export interface CreateProductInput {
  category_id?: number | null;
  sku: string; // REQUIRED - unique
  name: string;
  description?: string | null;
  price: number; // integer (VND)
  stock_quantity?: number; // default: 0
  brand?: string | null;
  view_count?: number; // default: 0
  sold_count?: number; // default: 0
  is_active?: boolean; // default: true
  search_vector?: string | null;
}

export interface UpdateProductInput {
  category_id?: number | null;
  sku?: string;
  name?: string;
  description?: string | null;
  price?: number;
  stock_quantity?: number;
  brand?: string | null;
  view_count?: number;
  sold_count?: number;
  is_active?: boolean;
  search_vector?: string | null;
}

