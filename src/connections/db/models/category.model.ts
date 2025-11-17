// Category Model - Based on migration 003_create_categories_table

export interface Category {
  id: number;
  name: string;
  image_url: string | null;
  description: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CreateCategoryInput {
  name: string;
  image_url?: string | null;
  description?: string | null;
  is_active?: boolean;
}

export interface UpdateCategoryInput {
  name?: string;
  image_url?: string | null;
  description?: string | null;
  is_active?: boolean;
}

