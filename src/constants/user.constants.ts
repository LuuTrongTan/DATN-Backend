/**
 * User Role Constants
 */
export const USER_ROLE = {
  CUSTOMER: 'customer',
  STAFF: 'staff',
  ADMIN: 'admin',
} as const;

export type UserRole = typeof USER_ROLE[keyof typeof USER_ROLE];

/**
 * User Status Constants
 */
export const USER_STATUS = {
  ACTIVE: true,
  INACTIVE: false,
} as const;

