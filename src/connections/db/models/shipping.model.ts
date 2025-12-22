// Shipping Model - Based on database_schema.dbml

export type ShippingStatus = 'pending' | 'picked_up' | 'in_transit' | 'delivered' | 'failed' | 'returned'; // varchar(20)

export interface Shipping {
  id: number;
  order_id: number;
  shipping_provider: string | null; // varchar(50)
  tracking_number: string | null; // varchar(100)
  shipping_fee: number; // DECIMAL(10, 2) - not null
  estimated_delivery_date: Date | null; // timestamp
  status: ShippingStatus; // default: 'pending'
  notes: string | null; // text
  created_at: Date;
  updated_at: Date;
}

export interface CreateShippingInput {
  order_id: number;
  shipping_provider?: string | null;
  tracking_number?: string | null;
  shipping_fee: number; // REQUIRED
  estimated_delivery_date?: Date | null;
  status?: ShippingStatus; // default: 'pending'
  notes?: string | null;
}

export interface UpdateShippingInput {
  shipping_provider?: string | null;
  tracking_number?: string | null;
  shipping_fee?: number;
  estimated_delivery_date?: Date | null;
  status?: ShippingStatus;
  notes?: string | null;
}


