export interface WishlistItem {
  id: number;
  user_id: number;
  product_id: number;
  created_at: string;
}

export interface CreateWishlistItemInput {
  product_id: number;
}


