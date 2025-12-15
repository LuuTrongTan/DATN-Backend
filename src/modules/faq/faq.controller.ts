import { Response } from 'express';
import { AuthRequest } from '../../types/request.types';
import { pool } from '../../connections';
import { z } from 'zod';

const faqSchema = z.object({
  question: z.string().min(1, 'Câu hỏi không được để trống'),
  answer: z.string().min(1, 'Câu trả lời không được để trống'),
  category: z.string().optional(),
  order_index: z.number().int().nonnegative().optional(),
  is_active: z.boolean().optional(),
});

// Get all FAQs (public)
export const getFAQs = async (req: AuthRequest, res: Response) => {
  try {
    const { category } = req.query;

    let query = 'SELECT * FROM faqs WHERE is_active = TRUE';
    const params: any[] = [];

    if (category) {
      query += ' AND category = $1';
      params.push(category);
    }

    query += ' ORDER BY order_index ASC, created_at DESC';

    const result = await pool.query(query, params);

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get FAQ by ID (public)
export const getFAQById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const result = await pool.query('SELECT * FROM faqs WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'FAQ không tồn tại',
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Create FAQ (admin/staff)
export const createFAQ = async (req: AuthRequest, res: Response) => {
  try {
    const validated = faqSchema.parse(req.body);
    const userId = req.user!.id;

    const result = await pool.query(
      `INSERT INTO faqs (question, answer, category, order_index, is_active, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        validated.question,
        validated.answer,
        validated.category || null,
        validated.order_index || 0,
        validated.is_active !== undefined ? validated.is_active : true,
        userId,
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Tạo FAQ thành công',
      data: result.rows[0],
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({
        success: false,
        message: 'Dữ liệu không hợp lệ',
        errors: error.errors,
      });
    }
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Update FAQ (admin/staff)
export const updateFAQ = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const validated = faqSchema.partial().parse(req.body);

    const checkResult = await pool.query('SELECT id FROM faqs WHERE id = $1', [id]);
    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'FAQ không tồn tại',
      });
    }

    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 0;

    if (validated.question !== undefined) {
      paramCount++;
      updates.push(`question = $${paramCount}`);
      values.push(validated.question);
    }
    if (validated.answer !== undefined) {
      paramCount++;
      updates.push(`answer = $${paramCount}`);
      values.push(validated.answer);
    }
    if (validated.category !== undefined) {
      paramCount++;
      updates.push(`category = $${paramCount}`);
      values.push(validated.category);
    }
    if (validated.order_index !== undefined) {
      paramCount++;
      updates.push(`order_index = $${paramCount}`);
      values.push(validated.order_index);
    }
    if (validated.is_active !== undefined) {
      paramCount++;
      updates.push(`is_active = $${paramCount}`);
      values.push(validated.is_active);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Không có trường nào để cập nhật',
      });
    }

    paramCount++;
    updates.push(`updated_at = NOW()`);
    paramCount++;
    values.push(id);

    const result = await pool.query(
      `UPDATE faqs SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );

    res.json({
      success: true,
      message: 'Cập nhật FAQ thành công',
      data: result.rows[0],
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({
        success: false,
        message: 'Dữ liệu không hợp lệ',
        errors: error.errors,
      });
    }
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Delete FAQ (admin/staff)
export const deleteFAQ = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const result = await pool.query('DELETE FROM faqs WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'FAQ không tồn tại',
      });
    }

    res.json({
      success: true,
      message: 'Xóa FAQ thành công',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};


