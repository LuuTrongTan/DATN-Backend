import { pool } from '../connections';
import nodemailer from 'nodemailer';
import { emailConfig } from '../connections/config/app.config';
import { logger } from './logging';

// Generate random code
export const generateCode = (length: number = 6): string => {
  return Math.floor(100000 + Math.random() * 900000).toString().substring(0, length);
};

// Email transporter
const transporter = nodemailer.createTransport({
  host: emailConfig.host,
  port: emailConfig.port,
  secure: false,
  auth: {
    user: emailConfig.user,
    pass: emailConfig.pass,
  },
});

// Firebase Phone Auth is handled on frontend
// Backend only verifies Firebase ID tokens

// Save verification code to database
export const saveVerificationCode = async (
  userId: number,
  code: string,
  type: 'email_verification' | 'password_reset' | 'otp' | 'email_recovery',
  expiresInMinutes: number = 10
): Promise<void> => {
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + expiresInMinutes);

  await pool.query(
    `INSERT INTO verification_codes (user_id, code, type, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [userId, code, type, expiresAt]
  );
};

// Send verification email
export const sendVerificationEmail = async (
  email: string,
  code: string,
  type: 'verification' | 'password_reset' = 'verification'
): Promise<void> => {
  // Check if email config is set
  if (!emailConfig.user || !emailConfig.pass) {
    logger.warn('Email not configured, skipping email send', { email, code });
    throw new Error('Email service chưa được cấu hình. Vui lòng cấu hình SMTP trong file .env');
  }

  const subject = type === 'verification' 
    ? 'Xác thực tài khoản' 
    : 'Đặt lại mật khẩu';
  
  const frontendUrl = process.env.FRONTEND_URL ;
  const link = `${frontendUrl}/verify?code=${code}&type=${type}`;
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">${subject}</h2>
      <p>Xin chào,</p>
      <p>Mã xác thực của bạn là: <strong style="font-size: 24px; color: #667eea; letter-spacing: 4px;">${code}</strong></p>
      <p>Hoặc click vào link sau: <a href="${link}" style="color: #667eea;">${link}</a></p>
      <p style="color: #999; font-size: 12px;">Mã này có hiệu lực trong 10 phút.</p>
      <p style="color: #999; font-size: 12px;">Nếu bạn không yêu cầu mã này, vui lòng bỏ qua email này.</p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"DATN System" <${emailConfig.user}>`,
      to: email,
      subject,
      html,
    });
    logger.info('Verification email sent successfully', { email, type });
  } catch (error: any) {
    logger.error('Failed to send verification email', { email, error: error.message });
    throw new Error('Không thể gửi email. Vui lòng kiểm tra cấu hình SMTP.');
  }
};

// Send OTP via SMS
// NOTE: With Firebase Phone Auth, SMS is sent by Firebase on the frontend
// This function is kept for backward compatibility but should not be used with Firebase
export const sendOTP = async (phone: string, code: string): Promise<void> => {
  // Firebase Phone Auth handles SMS sending on the frontend
  // Backend should not send SMS when using Firebase
  logger.warn('sendOTP called but Firebase Phone Auth is used. SMS should be sent from frontend.');
  throw new Error('Với Firebase Phone Auth, SMS được gửi từ frontend. Vui lòng sử dụng Firebase SDK trên frontend để gửi OTP.');
};

// Verify code
export const verifyCode = async (
  userId: number,
  code: string,
  type: string
): Promise<boolean> => {
  const result = await pool.query(
    `SELECT * FROM verification_codes
     WHERE user_id = $1 AND code = $2 AND type = $3
     AND is_used = FALSE AND expires_at > NOW()
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId, code, type]
  );

  if (result.rows.length === 0) {
    return false;
  }

  // Mark as used
  await pool.query(
    'UPDATE verification_codes SET is_used = TRUE WHERE id = $1',
    [result.rows[0].id]
  );

  return true;
};
