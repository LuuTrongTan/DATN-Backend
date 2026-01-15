/**
 * Order Status Constants - Based on database_schema.dbml
 */
export const ORDER_STATUS = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  PROCESSING: 'processing',
  SHIPPING: 'shipping', // Note: database uses 'shipping' not 'shipped'
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
} as const;

export type OrderStatus = typeof ORDER_STATUS[keyof typeof ORDER_STATUS];

/**
 * Payment Status Constants
 */
export const PAYMENT_STATUS = {
  PENDING: 'pending',
  PAID: 'paid',
  FAILED: 'failed',
} as const;

export type PaymentStatus = typeof PAYMENT_STATUS[keyof typeof PAYMENT_STATUS];

/**
 * Payment Method Constants
 */
export const PAYMENT_METHOD = {
  ONLINE: 'online',
  COD: 'cod',
} as const;

export type PaymentMethod = typeof PAYMENT_METHOD[keyof typeof PAYMENT_METHOD];

/**
 * Order Number Prefix
 */
export const ORDER_NUMBER_PREFIX = 'ORD';

/**
 * Generate Order Number
 */
export const generateOrderNumber = (userId: string): string => {
  // Use first 8 characters of UUID for order number (shorter and readable)
  const userIdShort = userId.replace(/-/g, '').substring(0, 8);
  return `${ORDER_NUMBER_PREFIX}-${Date.now()}-${userIdShort}`;
};

