// Category Model - Based on database_schema.dbml

export interface Category {
  id: number;
  parent_id: number | null; // NULL = danh mục gốc, có giá trị = danh mục con
  name: string;
  slug: string; // unique, SEO-friendly URL
  image_url: string | null;
  description: string | null;
  display_order: number; // default: 0 - Thứ tự hiển thị (số nhỏ hiển thị trước)
  is_active: boolean; // default: true
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null; // Soft delete
}

export interface CreateCategoryInput {
  parent_id?: number | null;
  name: string;
  slug: string; // REQUIRED - unique, SEO-friendly URL
  image_url?: string | null;
  description?: string | null;
  display_order?: number; // default: 0
  is_active?: boolean; // default: true
}

export interface UpdateCategoryInput {
  parent_id?: number | null;
  name?: string;
  slug?: string;
  image_url?: string | null;
  description?: string | null;
  display_order?: number;
  is_active?: boolean;
}

