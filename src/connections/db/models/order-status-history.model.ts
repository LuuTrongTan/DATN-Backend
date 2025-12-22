// OrderStatusHistory Model - Based on database_schema.dbml

export interface OrderStatusHistory {
  id: number;
  order_id: number;
  status: string; // varchar(20) - not null
  notes: string | null; // text
  updated_by: string | null; // UUID
  created_at: Date;
}

export interface CreateOrderStatusHistoryInput {
  order_id: number;
  status: string; // REQUIRED
  notes?: string | null;
  updated_by?: string | null; // UUID
}

