// VerificationCode Model - Based on database_schema.dbml

export type VerificationCodeType =
  | 'phone' // đăng ký
  | 'verify_email' // xác thực email
  | 'change_phone' // đổi số điện thoại
  | 'password_reset' // đặt lại mật khẩu
  | '2fa'; // two-factor authentication

export interface VerificationCode {
  id: number;
  user_id: string | null; // UUID
  contact_value: string; // not null - Gộp phone và email: phone khi type=phone/change_phone, email khi type=verify_email/password_reset
  code: string; // not null - varchar(10)
  type: VerificationCodeType; // not null
  expires_at: Date; // not null
  is_used: boolean; // default: false
  attempts: number; // default: 0
  created_at: Date;
}

export interface CreateVerificationCodeInput {
  user_id?: string | null; // UUID
  contact_value: string; // REQUIRED
  code: string; // REQUIRED
  type: VerificationCodeType; // REQUIRED
  expires_at: Date; // REQUIRED
  is_used?: boolean; // default: false
  attempts?: number; // default: 0
}

