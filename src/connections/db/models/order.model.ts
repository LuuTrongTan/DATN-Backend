// Order Model - Based on migration 007_create_orders_table

export type PaymentMethod = 'online' | 'cod';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';
export type OrderStatus = 'pending' | 'confirmed' | 'processing' | 'shipping' | 'delivered' | 'cancelled';

export interface Order {
  id: number;
  user_id: number;
  order_number: string;
  total_amount: number; // DECIMAL(10, 2)
  shipping_address: string;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  order_status: OrderStatus;
  shipping_fee: number; // DECIMAL(10, 2)
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateOrderInput {
  user_id: number;
  order_number: string;
  total_amount: number;
  shipping_address: string;
  payment_method: PaymentMethod;
  shipping_fee?: number;
  notes?: string | null;
  payment_status?: PaymentStatus;
  order_status?: OrderStatus;
}

export interface UpdateOrderInput {
  total_amount?: number;
  shipping_address?: string;
  payment_method?: PaymentMethod;
  payment_status?: PaymentStatus;
  order_status?: OrderStatus;
  shipping_fee?: number;
  notes?: string | null;
}

