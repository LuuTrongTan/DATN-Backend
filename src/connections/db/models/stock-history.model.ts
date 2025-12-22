// StockHistory Model - Based on database_schema.dbml

export type StockHistoryType = 'in' | 'out' | 'adjustment'; // varchar(20)

export interface StockHistory {
  id: number;
  product_id: number | null;
  variant_id: number | null;
  type: StockHistoryType; // not null
  quantity: number; // not null
  previous_stock: number; // not null
  new_stock: number; // not null
  reason: string | null; // text
  created_by: string | null; // UUID
  created_at: Date;
}

export interface CreateStockHistoryInput {
  product_id?: number | null;
  variant_id?: number | null;
  type: StockHistoryType; // REQUIRED
  quantity: number; // REQUIRED
  previous_stock: number; // REQUIRED
  new_stock: number; // REQUIRED
  reason?: string | null;
  created_by?: string | null; // UUID
}


