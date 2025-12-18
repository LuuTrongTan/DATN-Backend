/**
 * Order Status Constants
 */
export const ORDER_STATUS = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  PROCESSING: 'processing',
  SHIPPED: 'shipped',
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
  REFUNDED: 'refunded',
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
export const generateOrderNumber = (userId: number): string => {
  return `${ORDER_NUMBER_PREFIX}-${Date.now()}-${userId}`;
};

