import { Response } from 'express';
import { AuthRequest } from '../../types/request.types';
import { pool } from '../../connections';
import { createTicketSchema, updateTicketSchema, sendMessageSchema } from './support.validation';
import { ResponseHandler } from '../../utils/response';
import { logger } from '../../utils/logging';
import { generateTicketNumber } from '../../constants';

// Get all tickets for user (or all for admin/staff)
export const getTickets = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const role = req.user!.role;
    const { status, page = 1, limit = 20 } = req.query;

    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 20;
    const offset = (pageNum - 1) * limitNum;

    let query = `
      SELECT st.id, st.ticket_number, st.user_id, st.subject, st.description, st.status, st.priority, st.order_id, st.assigned_to, st.created_at, st.updated_at,
             u.email as user_email, 
             u.full_name as user_name,
             a.email as assigned_email,
             a.full_name as assigned_name
      FROM support_tickets st
      LEFT JOIN users u ON st.user_id = u.id
      LEFT JOIN users a ON st.assigned_to = a.id
    `;
    const params: any[] = [];
    let paramCount = 0;

    // Filter by user if not admin/staff
    if (role !== 'admin' && role !== 'staff') {
      paramCount++;
      query += ` WHERE st.user_id = $${paramCount}`;
      params.push(userId);
    } else {
      query += ` WHERE 1=1`;
    }

    // Filter by status
    if (status) {
      paramCount++;
      query += ` AND st.status = $${paramCount}`;
      params.push(status);
    }

    // Count total
    const countQuery = query.replace('SELECT st.*', 'SELECT COUNT(*)');
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);

    // Add pagination
    query += ` ORDER BY st.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(limitNum, offset);

    const result = await pool.query(query, params);

    return ResponseHandler.paginated(
      res,
      result.rows,
      {
        page: pageNum,
        limit: limitNum,
        total,
      },
      'Lấy danh sách ticket thành công'
    );
  } catch (error: any) {
    logger.error('Error fetching tickets', error instanceof Error ? error : new Error(String(error)), {
      userId: req.user?.id,
      role: req.user?.role,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi lấy danh sách ticket', error);
  }
};

// Get ticket by ID
export const getTicketById = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  try {
    const userId = req.user!.id;
    const role = req.user!.role;

    const result = await pool.query(
      `SELECT st.id, st.ticket_number, st.user_id, st.subject, st.description, st.status, st.priority, st.order_id, st.assigned_to, st.created_at, st.updated_at,
              u.email as user_email, 
              u.full_name as user_name,
              a.email as assigned_email,
              a.full_name as assigned_name
       FROM support_tickets st
       LEFT JOIN users u ON st.user_id = u.id
       LEFT JOIN users a ON st.assigned_to = a.id
       WHERE st.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return ResponseHandler.notFound(res, 'Ticket không tồn tại');
    }

    const ticket = result.rows[0];

    // Check permission: user can only see their own tickets, admin/staff can see all
    if (role !== 'admin' && role !== 'staff' && ticket.user_id !== userId) {
      return ResponseHandler.forbidden(res, 'Bạn không có quyền xem ticket này');
    }

    return ResponseHandler.success(res, ticket, 'Lấy thông tin ticket thành công');
  } catch (error: any) {
    logger.error('Error fetching ticket', error instanceof Error ? error : new Error(String(error)), {
      ticketId: id,
      userId: req.user?.id,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi lấy thông tin ticket', error);
  }
};

// Create ticket
export const createTicket = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  try {
    if (!userId) {
      return ResponseHandler.error(res, 'Người dùng chưa đăng nhập', 401);
    }
    const validated = createTicketSchema.parse(req.body);
    const ticketNumber = generateTicketNumber(userId);

    const result = await pool.query(
      `INSERT INTO support_tickets (ticket_number, user_id, subject, description, priority, order_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, ticket_number, user_id, subject, description, status, priority, order_id, assigned_to, created_at, updated_at`,
      [
        ticketNumber,
        userId,
        validated.subject,
        validated.description,
        validated.priority,
        validated.order_id || null,
      ]
    );

    return ResponseHandler.created(res, result.rows[0], 'Tạo ticket thành công');
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return ResponseHandler.validationError(res, error.errors);
    }
    logger.error('Error creating ticket', error instanceof Error ? error : new Error(String(error)), {
      userId,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi tạo ticket', error);
  }
};

// Update ticket
export const updateTicket = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  try {
    const validated = updateTicketSchema.parse(req.body);
    const userId = req.user!.id;
    const role = req.user!.role;

    // Check if ticket exists
    const checkResult = await pool.query('SELECT id, user_id, status, assigned_to FROM support_tickets WHERE id = $1', [id]);
    if (checkResult.rows.length === 0) {
      return ResponseHandler.notFound(res, 'Ticket không tồn tại');
    }

    const ticket = checkResult.rows[0];

    // Check permission: user can only update their own tickets (limited fields), admin/staff can update all
    if (role !== 'admin' && role !== 'staff') {
      if (ticket.user_id !== userId) {
        return ResponseHandler.forbidden(res, 'Bạn không có quyền cập nhật ticket này');
      }
      // Users can only update subject and description
      if (validated.status || validated.assigned_to) {
        return ResponseHandler.forbidden(res, 'Bạn không có quyền thay đổi trạng thái hoặc người được gán');
      }
    }

    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 0;

    if (validated.subject !== undefined) {
      paramCount++;
      updates.push(`subject = $${paramCount}`);
      values.push(validated.subject);
    }
    if (validated.description !== undefined) {
      paramCount++;
      updates.push(`description = $${paramCount}`);
      values.push(validated.description);
    }
    if (validated.status !== undefined) {
      paramCount++;
      updates.push(`status = $${paramCount}`);
      values.push(validated.status);
    }
    if (validated.priority !== undefined) {
      paramCount++;
      updates.push(`priority = $${paramCount}`);
      values.push(validated.priority);
    }
    if (validated.assigned_to !== undefined) {
      paramCount++;
      updates.push(`assigned_to = $${paramCount}`);
      values.push(validated.assigned_to);
    }

    if (updates.length === 0) {
      return ResponseHandler.error(res, 'Không có trường nào để cập nhật', 400);
    }

    paramCount++;
    updates.push(`updated_at = NOW()`);
    paramCount++;
    values.push(id);

    const result = await pool.query(
      `UPDATE support_tickets SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING id, ticket_number, user_id, subject, description, status, priority, order_id, assigned_to, created_at, updated_at`,
      values
    );

    return ResponseHandler.success(res, result.rows[0], 'Cập nhật ticket thành công');
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return ResponseHandler.validationError(res, error.errors);
    }
    logger.error('Error updating ticket', error instanceof Error ? error : new Error(String(error)), {
      ticketId: id,
      userId: req.user?.id,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi cập nhật ticket', error);
  }
};

// Get messages for a ticket
export const getTicketMessages = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.user?.id;
  const role = req.user?.role;
  try {
    if (!userId || !role) {
      return ResponseHandler.error(res, 'Người dùng chưa đăng nhập', 401);
    }

    // Check if ticket exists and user has permission
    const ticketResult = await pool.query('SELECT user_id FROM support_tickets WHERE id = $1', [id]);
    if (ticketResult.rows.length === 0) {
      return ResponseHandler.notFound(res, 'Ticket không tồn tại');
    }

    const ticket = ticketResult.rows[0];
    if (role !== 'admin' && role !== 'staff' && ticket.user_id !== userId) {
      return ResponseHandler.forbidden(res, 'Bạn không có quyền xem tin nhắn của ticket này');
    }

    const result = await pool.query(
      `SELECT tm.id, tm.ticket_id, tm.user_id, tm.message, tm.is_internal, tm.created_at, u.email as user_email, u.full_name as user_name
       FROM ticket_messages tm
       LEFT JOIN users u ON tm.user_id = u.id
       WHERE tm.ticket_id = $1
       ORDER BY tm.created_at ASC`,
      [id]
    );

    return ResponseHandler.success(res, result.rows, 'Lấy danh sách tin nhắn thành công');
  } catch (error: any) {
    logger.error('Error fetching ticket messages', error instanceof Error ? error : new Error(String(error)), {
      ticketId: id,
      userId: req.user?.id,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi lấy danh sách tin nhắn', error);
  }
};

// Send message to ticket
export const sendMessage = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.user?.id;
  const role = req.user?.role;
  try {
    if (!userId || !role) {
      return ResponseHandler.error(res, 'Người dùng chưa đăng nhập', 401);
    }
    const validated = sendMessageSchema.parse(req.body);

    // Check if ticket exists and user has permission
    const ticketResult = await pool.query('SELECT user_id, status FROM support_tickets WHERE id = $1', [id]);
    if (ticketResult.rows.length === 0) {
      return ResponseHandler.notFound(res, 'Ticket không tồn tại');
    }

    const ticket = ticketResult.rows[0];

    // Check if ticket is closed
    if (ticket.status === 'closed') {
      return ResponseHandler.error(res, 'Không thể gửi tin nhắn vào ticket đã đóng', 400);
    }

    // Check permission
    const isInternal = validated.is_internal && (role === 'admin' || role === 'staff');
    if (role !== 'admin' && role !== 'staff' && ticket.user_id !== userId) {
      return ResponseHandler.forbidden(res, 'Bạn không có quyền gửi tin nhắn vào ticket này');
    }

    const result = await pool.query(
      `INSERT INTO ticket_messages (ticket_id, user_id, message, is_internal)
       VALUES ($1, $2, $3, $4)
       RETURNING id, ticket_id, user_id, message, is_internal, created_at`,
      [id, userId, validated.message, isInternal]
    );

    // Update ticket updated_at
    await pool.query('UPDATE support_tickets SET updated_at = NOW() WHERE id = $1', [id]);

    return ResponseHandler.created(res, result.rows[0], 'Gửi tin nhắn thành công');
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return ResponseHandler.validationError(res, error.errors);
    }
    logger.error('Error sending ticket message', error instanceof Error ? error : new Error(String(error)), {
      ticketId: id,
      userId,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi gửi tin nhắn', error);
  }
};

