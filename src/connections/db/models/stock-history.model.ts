export type StockHistoryType = 'in' | 'out' | 'adjustment';

export interface StockHistory {
  id: number;
  product_id: number | null;
  variant_id: number | null;
  type: StockHistoryType;
  quantity: number;
  previous_stock: number;
  new_stock: number;
  reason: string | null;
  created_by: number | null;
  created_at: string;
}

export interface CreateStockHistoryInput {
  product_id?: number;
  variant_id?: number;
  type: StockHistoryType;
  quantity: number;
  previous_stock: number;
  new_stock: number;
  reason?: string;
  created_by?: number;
}

