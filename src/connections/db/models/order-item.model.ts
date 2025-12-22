// OrderItem Model - Based on database_schema.dbml

export interface OrderItem {
  id: number;
  order_id: number;
  product_id: number;
  variant_id: number | null;
  quantity: number; // not null
  price: number; // integer (VND) - not null
  created_at: Date;
}

export interface CreateOrderItemInput {
  order_id: number;
  product_id: number;
  variant_id?: number | null;
  quantity: number; // REQUIRED
  price: number; // REQUIRED - integer (VND)
}

