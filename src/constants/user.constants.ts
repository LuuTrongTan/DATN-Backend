/**
 * User Role Constants - Based on database_schema.dbml
 */
export const USER_ROLE = {
  CUSTOMER: 'customer', // default
  STAFF: 'staff',
  ADMIN: 'admin',
} as const;

export type UserRole = typeof USER_ROLE[keyof typeof USER_ROLE];

/**
 * User Status Constants - Based on database_schema.dbml
 * Note: status is varchar enum: active, banned, deleted
 */
export const USER_STATUS = {
  ACTIVE: 'active', // default
  BANNED: 'banned',
  DELETED: 'deleted',
} as const;

export type UserStatus = typeof USER_STATUS[keyof typeof USER_STATUS];

