export type RefundType = 'refund' | 'return' | 'exchange';
export type RefundStatus = 'pending' | 'approved' | 'rejected' | 'processing' | 'completed' | 'cancelled';

export interface Refund {
  id: number;
  refund_number: string;
  order_id: number;
  user_id: number;
  type: RefundType;
  reason: string;
  status: RefundStatus;
  refund_amount: number | null;
  admin_notes: string | null;
  processed_by: number | null;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateRefundInput {
  order_id: number;
  type: RefundType;
  reason: string;
  items: Array<{
    order_item_id: number;
    quantity: number;
    reason?: string;
  }>;
}

export interface UpdateRefundInput {
  status?: RefundStatus;
  refund_amount?: number;
  admin_notes?: string;
  processed_by?: number;
}

export interface RefundItem {
  id: number;
  refund_id: number;
  order_item_id: number;
  quantity: number;
  refund_amount: number;
  reason: string | null;
  created_at: string;
}

