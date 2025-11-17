// OrderItem Model - Based on migration 008_create_order_items_table

export interface OrderItem {
  id: number;
  order_id: number;
  product_id: number;
  variant_id: number | null;
  quantity: number;
  price: number; // DECIMAL(10, 2)
  created_at: Date;
}

export interface CreateOrderItemInput {
  order_id: number;
  product_id: number;
  variant_id?: number | null;
  quantity: number;
  price: number;
}

