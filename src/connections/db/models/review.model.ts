// Review Model - Based on database_schema.dbml

export interface Review {
  id: number;
  user_id: string; // UUID
  product_id: number;
  order_id: number;
  rating: number | null; // integer
  comment: string | null;
  image_urls: string[] | null; // varchar[]
  video_url: string | null; // varchar(500)
  reply: string | null;
  replied_at: Date | null;
  replied_by: string | null; // UUID
  helpful_count: number; // default: 0
  is_approved: boolean; // default: true
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null; // Soft delete
}

export interface CreateReviewInput {
  user_id: string; // UUID
  product_id: number;
  order_id: number;
  rating?: number | null;
  comment?: string | null;
  image_urls?: string[];
  video_url?: string | null;
  is_approved?: boolean; // default: true
}

export interface UpdateReviewInput {
  rating?: number | null;
  comment?: string | null;
  image_urls?: string[];
  video_url?: string | null;
  reply?: string | null;
  replied_at?: Date | null;
  replied_by?: string | null;
  helpful_count?: number;
  is_approved?: boolean;
}

