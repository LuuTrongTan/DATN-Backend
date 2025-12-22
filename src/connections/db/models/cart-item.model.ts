// CartItem Model - Based on database_schema.dbml

export interface CartItem {
  id: number;
  user_id: string; // UUID
  product_id: number;
  variant_id: number | null;
  quantity: number; // not null, default: 1
  created_at: Date;
  updated_at: Date;
}

export interface CreateCartItemInput {
  user_id: string; // UUID
  product_id: number;
  variant_id?: number | null;
  quantity?: number; // default: 1
}

export interface UpdateCartItemInput {
  quantity?: number;
}

