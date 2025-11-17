import { pool } from '../connections';
import nodemailer from 'nodemailer';
import twilio from 'twilio';
import { emailConfig, smsConfig } from '../connections/config/app.config';

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

// Twilio client
const twilioClient = smsConfig.accountSid && smsConfig.authToken
  ? twilio(smsConfig.accountSid, smsConfig.authToken)
  : null;

// Save verification code to database
export const saveVerificationCode = async (
  userId: number,
  code: string,
  type: 'email_verification' | 'password_reset' | 'otp',
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
  const subject = type === 'verification' 
    ? 'Xác thực tài khoản' 
    : 'Đặt lại mật khẩu';
  
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
  const link = `${frontendUrl}/verify?code=${code}&type=${type}`;
  
  const html = `
    <h2>${subject}</h2>
    <p>Mã xác thực của bạn là: <strong>${code}</strong></p>
    <p>Hoặc click vào link sau: <a href="${link}">${link}</a></p>
    <p>Mã này có hiệu lực trong 10 phút.</p>
  `;

  await transporter.sendMail({
    from: emailConfig.user,
    to: email,
    subject,
    html,
  });
};

// Send OTP via SMS
export const sendOTP = async (phone: string, code: string): Promise<void> => {
  if (!twilioClient) {
    console.warn('Twilio not configured, skipping SMS send');
    return;
  }

  await twilioClient.messages.create({
    body: `Mã OTP của bạn là: ${code}. Mã này có hiệu lực trong 10 phút.`,
    from: smsConfig.phoneNumber,
    to: phone,
  });
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
