// Refund Model - Based on database_schema.dbml

export type RefundType = 'refund' | 'return' | 'exchange'; // varchar(20)
export type RefundStatus = 'pending' | 'approved' | 'rejected' | 'processing' | 'completed' | 'cancelled'; // varchar(20)

export interface Refund {
  id: number;
  refund_number: string; // unique, not null
  order_id: number;
  user_id: string; // UUID
  type: RefundType; // not null
  reason: string; // text - not null
  status: RefundStatus; // default: 'pending'
  refund_amount: number | null; // DECIMAL(10, 2)
  admin_notes: string | null; // text
  processed_by: string | null; // UUID
  processed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateRefundInput {
  refund_number: string; // REQUIRED - unique
  order_id: number;
  user_id: string; // UUID
  type: RefundType; // REQUIRED
  reason: string; // REQUIRED
  status?: RefundStatus; // default: 'pending'
  refund_amount?: number | null;
  admin_notes?: string | null;
  processed_by?: string | null; // UUID
  processed_at?: Date | null;
}

export interface UpdateRefundInput {
  status?: RefundStatus;
  refund_amount?: number | null;
  admin_notes?: string | null;
  processed_by?: string | null; // UUID
  processed_at?: Date | null;
}

export interface RefundItem {
  id: number;
  refund_id: number;
  order_item_id: number;
  quantity: number; // not null
  refund_amount: number; // DECIMAL(10, 2) - not null
  reason: string | null; // text
  created_at: Date;
}


