/**
 * Support Ticket Status Constants
 */
export const TICKET_STATUS = {
  OPEN: 'open',
  IN_PROGRESS: 'in_progress',
  RESOLVED: 'resolved',
  CLOSED: 'closed',
} as const;

export type TicketStatus = typeof TICKET_STATUS[keyof typeof TICKET_STATUS];

/**
 * Support Ticket Priority Constants
 */
export const TICKET_PRIORITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  URGENT: 'urgent',
} as const;

export type TicketPriority = typeof TICKET_PRIORITY[keyof typeof TICKET_PRIORITY];

/**
 * Ticket Number Prefix
 */
export const TICKET_NUMBER_PREFIX = 'TKT';

/**
 * Generate Ticket Number
 */
export const generateTicketNumber = (userId: number): string => {
  return `${TICKET_NUMBER_PREFIX}-${Date.now()}-${userId}`;
};

