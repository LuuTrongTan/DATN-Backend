// OrderStatusHistory Model - Based on migration 009_create_order_status_history_table

export interface OrderStatusHistory {
  id: number;
  order_id: number;
  status: string;
  notes: string | null;
  updated_by: number | null;
  created_at: Date;
}

export interface CreateOrderStatusHistoryInput {
  order_id: number;
  status: string;
  notes?: string | null;
  updated_by?: number | null;
}

