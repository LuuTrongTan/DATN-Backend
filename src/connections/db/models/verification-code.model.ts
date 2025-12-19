// VerificationCode Model - Based on migration 002_create_verification_codes_table

export type VerificationCodeType =
  | 'phone'
  | 'verify_email'
  | 'change_phone'
  | 'password_reset'
  | '2fa';

export interface VerificationCode {
  id: number;
  user_id: string | null;
  contact_value: string;
  code: string;
  type: VerificationCodeType;
  expires_at: Date;
  is_used: boolean;
  attempts: number;
  created_at: Date;
}

export interface CreateVerificationCodeInput {
  user_id: string | null;
  contact_value: string;
  code: string;
  type: VerificationCodeType;
  expires_at: Date;
  is_used?: boolean;
  attempts?: number;
}

