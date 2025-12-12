export interface FAQ {
  id: number;
  question: string;
  answer: string;
  category: string | null;
  order_index: number;
  is_active: boolean;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface CreateFAQInput {
  question: string;
  answer: string;
  category?: string;
  order_index?: number;
  is_active?: boolean;
}

export interface UpdateFAQInput {
  question?: string;
  answer?: string;
  category?: string;
  order_index?: number;
  is_active?: boolean;
}

