import { z } from 'zod';

// Helper function để tạo slug từ name
function createSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Schema cho create tag
export const createTagSchema = z.object({
  name: z.string().min(1, 'Tên tag không được để trống').max(100, 'Tên tag không được quá 100 ký tự'),
  slug: z.string().optional(),
}).transform((data) => {
  // Auto-generate slug nếu không có
  if (!data.slug) {
    return { ...data, slug: createSlug(data.name) };
  }
  return data;
});

// Schema cho update tag
export const updateTagSchema = z.object({
  name: z.string().min(1, 'Tên tag không được để trống').max(100, 'Tên tag không được quá 100 ký tự').optional(),
  slug: z.string().optional(),
}).transform((data) => {
  // Auto-generate slug nếu có name mới nhưng không có slug
  if (data.name && !data.slug) {
    return { ...data, slug: createSlug(data.name) };
  }
  return data;
});
