// Wishlist Model - Based on database_schema.dbml

export interface WishlistItem {
  id: number;
  user_id: string; // UUID
  product_id: number;
  created_at: Date;
}

export interface CreateWishlistItemInput {
  user_id: string; // UUID
  product_id: number;
}


