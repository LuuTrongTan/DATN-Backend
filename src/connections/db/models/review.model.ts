// Review Model - Based on migration 010_create_reviews_table

export interface Review {
  id: number;
  user_id: number;
  product_id: number;
  order_id: number;
  rating: number; // 1-5
  comment: string | null;
  image_urls: string[] | null;
  video_url: string | null;
  is_approved: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CreateReviewInput {
  user_id: number;
  product_id: number;
  order_id: number;
  rating: number;
  comment: string;
  image_urls?: string[];
  video_url?: string | null;
  is_approved?: boolean;
}

export interface UpdateReviewInput {
  rating?: number;
  comment?: string;
  image_urls?: string[];
  video_url?: string | null;
  is_approved?: boolean;
}

