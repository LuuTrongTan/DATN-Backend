export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface SupportTicket {
  id: number;
  ticket_number: string;
  user_id: number;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  assigned_to: number | null;
  order_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface CreateTicketInput {
  subject: string;
  description: string;
  priority?: TicketPriority;
  order_id?: number;
}

export interface UpdateTicketInput {
  subject?: string;
  description?: string;
  status?: TicketStatus;
  priority?: TicketPriority;
  assigned_to?: number;
}

export interface TicketMessage {
  id: number;
  ticket_id: number;
  user_id: number;
  message: string;
  is_internal: boolean;
  created_at: string;
}

