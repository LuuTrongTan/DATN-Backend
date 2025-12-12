export type DiscountType = 'percentage' | 'fixed';
export type ApplicableTo = 'all' | 'category' | 'product';

export interface Coupon {
  id: number;
  code: string;
  name: string;
  description: string | null;
  discount_type: DiscountType;
  discount_value: number;
  min_order_amount: number;
  max_discount_amount: number | null;
  usage_limit: number | null;
  used_count: number;
  user_limit: number;
  start_date: string;
  end_date: string;
  is_active: boolean;
  applicable_to: ApplicableTo;
  category_id: number | null;
  product_id: number | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface CreateCouponInput {
  code: string;
  name: string;
  description?: string;
  discount_type: DiscountType;
  discount_value: number;
  min_order_amount?: number;
  max_discount_amount?: number;
  usage_limit?: number;
  user_limit?: number;
  start_date: string;
  end_date: string;
  applicable_to?: ApplicableTo;
  category_id?: number;
  product_id?: number;
}

export interface UpdateCouponInput {
  name?: string;
  description?: string;
  discount_type?: DiscountType;
  discount_value?: number;
  min_order_amount?: number;
  max_discount_amount?: number;
  usage_limit?: number;
  user_limit?: number;
  start_date?: string;
  end_date?: string;
  is_active?: boolean;
  applicable_to?: ApplicableTo;
  category_id?: number;
  product_id?: number;
}

export interface CouponUsage {
  id: number;
  coupon_id: number;
  user_id: number;
  order_id: number;
  discount_amount: number;
  used_at: string;
}

