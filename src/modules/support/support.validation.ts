import { z } from 'zod';

export const createTicketSchema = z.object({
  subject: z.string().min(1, 'Tiêu đề không được để trống').max(255, 'Tiêu đề không được quá 255 ký tự'),
  description: z.string().min(1, 'Mô tả không được để trống'),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional().default('medium'),
  order_id: z.number().int().positive().optional(),
});

export const updateTicketSchema = z.object({
  subject: z.string().min(1).max(255).optional(),
  description: z.string().min(1).optional(),
  status: z.enum(['open', 'in_progress', 'resolved', 'closed']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  assigned_to: z.number().int().positive().optional(),
});

export const sendMessageSchema = z.object({
  message: z.string().min(1, 'Tin nhắn không được để trống'),
  is_internal: z.boolean().optional().default(false),
});

