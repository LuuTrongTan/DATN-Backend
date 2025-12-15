export type ShippingStatus = 'pending' | 'picked_up' | 'in_transit' | 'delivered' | 'failed' | 'returned';

export interface Shipping {
  id: number;
  order_id: number;
  shipping_provider: string | null;
  tracking_number: string | null;
  shipping_fee: number;
  estimated_delivery_date: string | null;
  status: ShippingStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateShippingInput {
  order_id: number;
  shipping_provider?: string;
  tracking_number?: string;
  shipping_fee: number;
  estimated_delivery_date?: string;
  status?: ShippingStatus;
  notes?: string;
}

export interface UpdateShippingInput {
  shipping_provider?: string;
  tracking_number?: string;
  shipping_fee?: number;
  estimated_delivery_date?: string;
  status?: ShippingStatus;
  notes?: string;
}


