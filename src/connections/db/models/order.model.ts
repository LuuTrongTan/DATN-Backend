// Order Model - Based on database_schema.dbml

export type PaymentMethod = 'online' | 'cod';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';
export type OrderStatus = 'pending' | 'confirmed' | 'processing' | 'shipping' | 'delivered' | 'cancelled';

export interface Order {
  id: number;
  user_id: string; // UUID
  order_number: string; // unique
  subtotal: number; // DECIMAL(10, 2) - not null
  discount_amount: number; // DECIMAL(10, 2) - default: 0
  tax_amount: number; // DECIMAL(10, 2) - default: 0
  shipping_fee: number; // DECIMAL(10, 2) - default: 0
  total_amount: number; // DECIMAL(10, 2) - not null
  shipping_address: string; // text - not null
  payment_method: PaymentMethod; // not null
  payment_status: PaymentStatus; // default: 'pending'
  order_status: OrderStatus; // default: 'pending'
  cancelled_at: Date | null;
  cancelled_by: string | null; // UUID - user who cancelled
  cancellation_reason: string | null; // text
  delivery_date: Date | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null; // Soft delete
}

export interface CreateOrderInput {
  user_id: string; // UUID
  order_number: string; // REQUIRED - unique
  subtotal: number; // REQUIRED
  discount_amount?: number; // default: 0
  tax_amount?: number; // default: 0
  shipping_fee?: number; // default: 0
  total_amount: number; // REQUIRED
  shipping_address: string; // REQUIRED
  payment_method: PaymentMethod; // REQUIRED
  payment_status?: PaymentStatus; // default: 'pending'
  order_status?: OrderStatus; // default: 'pending'
  cancelled_at?: Date | null;
  cancelled_by?: string | null;
  cancellation_reason?: string | null;
  delivery_date?: Date | null;
  notes?: string | null;
}

export interface UpdateOrderInput {
  subtotal?: number;
  discount_amount?: number;
  tax_amount?: number;
  shipping_fee?: number;
  total_amount?: number;
  shipping_address?: string;
  payment_method?: PaymentMethod;
  payment_status?: PaymentStatus;
  order_status?: OrderStatus;
  cancelled_at?: Date | null;
  cancelled_by?: string | null;
  cancellation_reason?: string | null;
  delivery_date?: Date | null;
  notes?: string | null;
}

