// VerificationCode Model - Based on migration 002_create_verification_codes_table

export type VerificationCodeType = 'email_verification' | 'password_reset' | 'otp';

export interface VerificationCode {
  id: number;
  user_id: number;
  code: string;
  type: VerificationCodeType;
  expires_at: Date;
  is_used: boolean;
  created_at: Date;
}

export interface CreateVerificationCodeInput {
  user_id: number;
  code: string;
  type: VerificationCodeType;
  expires_at: Date;
  is_used?: boolean;
}

