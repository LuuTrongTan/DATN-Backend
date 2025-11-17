import { Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../../connections';
import { AuthRequest } from '../../middlewares/auth.middleware';
import { registerSchema, loginSchema } from '../../utils/validation';
import {
  generateCode,
  saveVerificationCode,
  sendVerificationEmail,
  sendOTP,
  verifyCode,
} from '../../utils/verification';
import { appConfig } from '../../connections/config/app.config';

// UC-01: Đăng ký
export const register = async (req: AuthRequest, res: Response) => {
  try {
    const validated = registerSchema.parse(req.body);
    const { email, phone, password } = validated;

    // Check if user already exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1 OR phone = $2',
      [email, phone]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({
        message: 'Email hoặc số điện thoại đã được đăng ký',
        suggestion: 'Vui lòng đăng nhập hoặc sử dụng email/số điện thoại khác',
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const result = await pool.query(
      `INSERT INTO users (email, phone, password_hash, is_verified)
       VALUES ($1, $2, $3, FALSE)
       RETURNING id, email, phone, role`,
      [email || null, phone || null, passwordHash]
    );

    const user = result.rows[0];

    // Generate and send verification code
    const code = generateCode();
    const verificationType = email ? 'email_verification' : 'otp';
    
    await saveVerificationCode(user.id, code, verificationType, 10);

    if (email) {
      await sendVerificationEmail(email, code, 'verification');
    } else if (phone) {
      await sendOTP(phone, code);
    }

    res.status(201).json({
      message: 'Đăng ký thành công. Vui lòng xác thực tài khoản.',
      userId: user.id,
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({
        message: 'Dữ liệu không hợp lệ',
        errors: error.errors,
      });
    }
    res.status(500).json({ message: error.message });
  }
};

// UC-02: Gửi lại mã xác nhận
export const resendVerification = async (req: AuthRequest, res: Response) => {
  try {
    const { email, phone } = req.body;

    if (!email && !phone) {
      return res.status(400).json({ message: 'Phải cung cấp email hoặc số điện thoại' });
    }

    const result = await pool.query(
      'SELECT id, email, phone, is_verified FROM users WHERE email = $1 OR phone = $2',
      [email, phone]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Tài khoản không tồn tại' });
    }

    const user = result.rows[0];

    if (user.is_verified) {
      return res.status(400).json({ message: 'Tài khoản đã được xác thực' });
    }

    // Check rate limit (1 minute cooldown)
    const recentCode = await pool.query(
      `SELECT created_at FROM verification_codes
       WHERE user_id = $1 AND type IN ('email_verification', 'otp')
       ORDER BY created_at DESC LIMIT 1`,
      [user.id]
    );

    if (recentCode.rows.length > 0) {
      const lastSent = new Date(recentCode.rows[0].created_at);
      const now = new Date();
      const diffMinutes = (now.getTime() - lastSent.getTime()) / 1000 / 60;

      if (diffMinutes < 1) {
        return res.status(429).json({
          message: 'Vui lòng đợi 1 phút trước khi yêu cầu lại mã xác nhận',
        });
      }
    }

    // Generate and send new code
    const code = generateCode();
    const verificationType = email ? 'email_verification' : 'otp';
    
    await saveVerificationCode(user.id, code, verificationType, 10);

    if (email) {
      await sendVerificationEmail(email, code, 'verification');
    } else if (phone) {
      await sendOTP(phone, code);
    }

    res.json({ message: 'Đã gửi lại mã xác nhận thành công' });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// UC-03: Xác thực
export const verify = async (req: AuthRequest, res: Response) => {
  try {
    const { code, email, phone } = req.body;

    if (!code) {
      return res.status(400).json({ message: 'Mã xác thực không được để trống' });
    }

    if (!email && !phone) {
      return res.status(400).json({ message: 'Phải cung cấp email hoặc số điện thoại' });
    }

    const userResult = await pool.query(
      'SELECT id FROM users WHERE email = $1 OR phone = $2',
      [email, phone]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'Tài khoản không tồn tại' });
    }

    const userId = userResult.rows[0].id;
    const verificationType = email ? 'email_verification' : 'otp';

    const isValid = await verifyCode(userId, code, verificationType);

    if (!isValid) {
      return res.status(400).json({
        message: 'Mã xác thực không đúng hoặc đã hết hạn',
        suggestion: 'Vui lòng yêu cầu gửi lại mã xác thực',
      });
    }

    // Update user as verified
    await pool.query('UPDATE users SET is_verified = TRUE WHERE id = $1', [userId]);

    res.json({ message: 'Xác thực thành công' });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// UC-04: Quên mật khẩu
export const forgotPassword = async (req: AuthRequest, res: Response) => {
  try {
    const { email, phone } = req.body;

    if (!email && !phone) {
      return res.status(400).json({ message: 'Phải cung cấp email hoặc số điện thoại' });
    }

    const result = await pool.query(
      'SELECT id, email, phone FROM users WHERE email = $1 OR phone = $2',
      [email, phone]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Tài khoản không tồn tại' });
    }

    const user = result.rows[0];

    // Generate reset code
    const code = generateCode();
    await saveVerificationCode(user.id, code, 'password_reset', 5);

    if (email) {
      await sendVerificationEmail(email, code, 'password_reset');
    } else if (phone) {
      await sendOTP(phone, code);
    }

    res.json({ message: 'Đã gửi mã đặt lại mật khẩu thành công' });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// UC-05: Đăng nhập
export const login = async (req: AuthRequest, res: Response) => {
  try {
    const validated = loginSchema.parse(req.body);
    const { email, phone, password } = validated;

    // Find user
    const result = await pool.query(
      `SELECT id, email, phone, password_hash, role, is_verified, is_active, is_banned
       FROM users WHERE email = $1 OR phone = $2`,
      [email, phone]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Thông tin đăng nhập không đúng' });
    }

    const user = result.rows[0];

    if (!user.is_verified) {
      return res.status(403).json({
        message: 'Tài khoản chưa được xác thực',
        suggestion: 'Vui lòng xác thực tài khoản trước khi đăng nhập',
      });
    }

    if (!user.is_active || user.is_banned) {
      return res.status(403).json({ message: 'Tài khoản đã bị khóa' });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      return res.status(401).json({ message: 'Thông tin đăng nhập không đúng' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, role: user.role },
      appConfig.jwtSecret,
      { expiresIn: appConfig.jwtExpiresIn }
    );

    res.json({
      message: 'Đăng nhập thành công',
      token,
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({
        message: 'Dữ liệu không hợp lệ',
        errors: error.errors,
      });
    }
    res.status(500).json({ message: error.message });
  }
};

// UC-06: Đổi mật khẩu
export const changePassword = async (req: AuthRequest, res: Response) => {
  try {
    const { oldPassword, newPassword, confirmPassword } = req.body;

    if (!oldPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ message: 'Vui lòng điền đầy đủ thông tin' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ message: 'Mật khẩu mới phải có ít nhất 8 ký tự' });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: 'Xác nhận mật khẩu không khớp' });
    }

    // Get current user password
    const result = await pool.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [req.user!.id]
    );

    const user = result.rows[0];

    // Verify old password
    const isValidPassword = await bcrypt.compare(oldPassword, user.password_hash);

    if (!isValidPassword) {
      return res.status(400).json({ message: 'Mật khẩu cũ không đúng' });
    }

    // Update password
    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [
      newPasswordHash,
      req.user!.id,
    ]);

    res.json({ message: 'Đổi mật khẩu thành công' });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// Get current user
export const getCurrentUser = async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT id, email, phone, full_name, role, created_at FROM users WHERE id = $1',
      [req.user!.id]
    );

    res.json({ user: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

