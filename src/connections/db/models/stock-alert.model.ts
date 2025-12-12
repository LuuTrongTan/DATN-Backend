export interface StockAlert {
  id: number;
  product_id: number | null;
  variant_id: number | null;
  threshold: number;
  current_stock: number;
  is_notified: boolean;
  notified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateStockAlertInput {
  product_id?: number;
  variant_id?: number;
  threshold?: number;
  current_stock: number;
}

