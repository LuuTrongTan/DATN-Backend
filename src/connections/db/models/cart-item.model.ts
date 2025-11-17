// CartItem Model - Based on migration 006_create_cart_items_table

export interface CartItem {
  id: number;
  user_id: number;
  product_id: number;
  variant_id: number | null;
  quantity: number;
  created_at: Date;
  updated_at: Date;
}

export interface CreateCartItemInput {
  user_id: number;
  product_id: number;
  variant_id?: number | null;
  quantity: number;
}

export interface UpdateCartItemInput {
  quantity?: number;
}

