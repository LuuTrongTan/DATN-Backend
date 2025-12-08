import { Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../../connections';
import { AuthRequest } from '../../types/request.types';
import {
  registerSchema,
  loginSchema,
  resetPasswordSchema,
  updateProfileSchema,
  verifyPasswordSchema,
  refreshTokenSchema,
  deleteAccountSchema,
} from './auth.validation';
import {
  generateCode,
  saveVerificationCode,
  sendVerificationEmail,
  verifyCode,
} from '../../utils/verification';
import { verifyFirebaseToken, getFirebaseUserByPhone } from '../../connections';
import { appConfig } from '../../connections/config/app.config';
import { ResponseHandler } from '../../utils/response';
import { logger, auditLog } from '../../utils/logging';
import { LoginResponse, AuthResponse, RefreshTokenResponse } from '../../types/response.types';

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
      logger.warn('[Register] User already exists', { email, phone, ip: req.ip });
      return ResponseHandler.conflict(
        res,
        'Email hoặc số điện thoại đã được đăng ký',
        { suggestion: 'Vui lòng đăng nhập hoặc sử dụng email/số điện thoại khác' }
      );
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
      // With Firebase Phone Auth, SMS is sent from frontend
      // Backend only verifies Firebase ID token
      logger.info('[Register] Phone registration - Firebase Phone Auth should be used on frontend', { phone });
    }

    auditLog('USER_REGISTERED', {
      userId: user.id,
      email,
      phone,
      ip: req.ip,
    });

    logger.info('[Register] User registered successfully', { userId: user.id, email, phone });

    return ResponseHandler.created(
      res,
      { userId: user.id, email: user.email, phone: user.phone },
      'Đăng ký thành công. Vui lòng xác thực tài khoản.'
    );
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return ResponseHandler.validationError(res, error.errors);
    }
    return ResponseHandler.internalError(res, 'Lỗi khi đăng ký', error);
  }
};

// UC-02: Gửi lại mã xác nhận
export const resendVerification = async (req: AuthRequest, res: Response) => {
  try {
    const { email, phone } = req.body;

    if (!email && !phone) {
      return ResponseHandler.error(res, 'Phải cung cấp email hoặc số điện thoại', 400);
    }

    const result = await pool.query(
      'SELECT id, email, phone, is_verified FROM users WHERE email = $1 OR phone = $2',
      [email, phone]
    );

    if (result.rows.length === 0) {
      logger.warn('[ResendVerification] User not found', { email, phone, ip: req.ip });
      return ResponseHandler.notFound(res, 'Tài khoản không tồn tại');
    }

    const user = result.rows[0];

    if (user.is_verified) {
      return ResponseHandler.error(res, 'Tài khoản đã được xác thực', 400);
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
        return ResponseHandler.tooManyRequests(
          res,
          'Vui lòng đợi 1 phút trước khi yêu cầu lại mã xác nhận',
          60
        );
      }
    }

    // Generate and send new code
    const code = generateCode();
    const verificationType = email ? 'email_verification' : 'otp';
    
    await saveVerificationCode(user.id, code, verificationType, 10);

    if (email) {
      await sendVerificationEmail(email, code, 'verification');
    } else if (phone) {
      // With Firebase Phone Auth, SMS is sent from frontend
      logger.info('[ResendVerification] Phone verification - Firebase Phone Auth should be used on frontend', { phone });
    }

    logger.info('[ResendVerification] Code sent successfully', { userId: user.id, email, phone });

    return ResponseHandler.success(res, null, 'Đã gửi lại mã xác nhận thành công');
  } catch (error: any) {
    return ResponseHandler.internalError(res, 'Lỗi khi gửi lại mã xác nhận', error);
  }
};

// UC-03: Xác thực
export const verify = async (req: AuthRequest, res: Response) => {
  try {
    const { code, email, phone } = req.body;

    if (!code) {
      return ResponseHandler.error(res, 'Mã xác thực không được để trống', 400);
    }

    if (!email && !phone) {
      return ResponseHandler.error(res, 'Phải cung cấp email hoặc số điện thoại', 400);
    }

    const userResult = await pool.query(
      'SELECT id FROM users WHERE email = $1 OR phone = $2',
      [email, phone]
    );

    if (userResult.rows.length === 0) {
      logger.warn('[Verify] User not found', { email, phone, ip: req.ip });
      return ResponseHandler.notFound(res, 'Tài khoản không tồn tại');
    }

    const userId = userResult.rows[0].id;
    const verificationType = email ? 'email_verification' : 'otp';

    const isValid = await verifyCode(userId, code, verificationType);

    if (!isValid) {
      logger.warn('[Verify] Invalid code', { userId, email, phone, ip: req.ip });
      return ResponseHandler.error(
        res,
        'Mã xác thực không đúng hoặc đã hết hạn',
        400,
        { code: 'INVALID_CODE', details: { suggestion: 'Vui lòng yêu cầu gửi lại mã xác thực' } }
      );
    }

    // Update user as verified
    await pool.query('UPDATE users SET is_verified = TRUE WHERE id = $1', [userId]);

    auditLog('USER_VERIFIED', {
      userId,
      email,
      phone,
      ip: req.ip,
    });

    logger.info('[Verify] Account verified successfully', { userId, email, phone });

    return ResponseHandler.success(res, null, 'Xác thực thành công');
  } catch (error: any) {
    return ResponseHandler.internalError(res, 'Lỗi khi xác thực', error);
  }
};

// UC-04: Quên mật khẩu
export const forgotPassword = async (req: AuthRequest, res: Response) => {
  try {
    const { email, phone } = req.body;

    if (!email && !phone) {
      return ResponseHandler.error(res, 'Phải cung cấp email hoặc số điện thoại', 400);
    }

    const result = await pool.query(
      'SELECT id, email, phone FROM users WHERE email = $1 OR phone = $2',
      [email, phone]
    );

    if (result.rows.length === 0) {
      // Don't reveal that user doesn't exist for security
      logger.warn('[ForgotPassword] User not found', { email, phone, ip: req.ip });
      return ResponseHandler.success(res, null, 'Đã gửi mã đặt lại mật khẩu thành công');
    }

    const user = result.rows[0];

    // Generate reset code
    const code = generateCode();
    await saveVerificationCode(user.id, code, 'password_reset', 5);

    if (email) {
      await sendVerificationEmail(email, code, 'password_reset');
    } else if (phone) {
      // With Firebase Phone Auth, SMS is sent from frontend
      logger.info('[ForgotPassword] Phone reset - Firebase Phone Auth should be used on frontend', { phone });
    }

    auditLog('PASSWORD_RESET_REQUESTED', {
      userId: user.id,
      email,
      phone,
      ip: req.ip,
    });

    logger.info('[ForgotPassword] Reset code sent successfully', { userId: user.id, email, phone });

    return ResponseHandler.success(res, null, 'Đã gửi mã đặt lại mật khẩu thành công');
  } catch (error: any) {
    return ResponseHandler.internalError(res, 'Lỗi khi gửi mã đặt lại mật khẩu', error);
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
      logger.warn('[Login] User not found', { email, phone, ip: req.ip });
      return ResponseHandler.unauthorized(res, 'Thông tin đăng nhập không đúng');
    }

    const user = result.rows[0];

    if (!user.is_verified) {
      logger.warn('[Login] Account not verified', { userId: user.id, ip: req.ip });
      return ResponseHandler.error(
        res,
        'Tài khoản chưa được xác thực',
        403,
        {
          code: 'ACCOUNT_NOT_VERIFIED',
          details: { suggestion: 'Vui lòng xác thực tài khoản trước khi đăng nhập' },
        }
      );
    }

    if (!user.is_active || user.is_banned) {
      logger.warn('[Login] Account banned or inactive', { userId: user.id, ip: req.ip });
      return ResponseHandler.forbidden(res, 'Tài khoản đã bị khóa');
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      logger.warn('[Login] Invalid password', { userId: user.id, ip: req.ip });
      return ResponseHandler.unauthorized(res, 'Thông tin đăng nhập không đúng');
    }

    // Generate JWT access token
    const token = jwt.sign(
      { userId: user.id, role: user.role },
      appConfig.jwtSecret as string,
      { expiresIn: appConfig.jwtExpiresIn } as any
    );

    // Generate refresh token (longer expiry, e.g., 30 days)
    const refreshToken = jwt.sign(
      { userId: user.id, role: user.role, type: 'refresh' },
      appConfig.jwtSecret as string,
      { expiresIn: '30d' } as any
    );

    auditLog('USER_LOGIN', {
      userId: user.id,
      email: user.email,
      phone: user.phone,
      ip: req.ip,
    });

    logger.info('[Login] User logged in successfully', { userId: user.id, email: user.email, phone: user.phone });

    const responseData: LoginResponse = {
      token,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
    };

    return ResponseHandler.success(res, responseData, 'Đăng nhập thành công');
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return ResponseHandler.validationError(res, error.errors);
    }
    return ResponseHandler.internalError(res, 'Lỗi khi đăng nhập', error);
  }
};

// UC-06: Đổi mật khẩu
export const changePassword = async (req: AuthRequest, res: Response) => {
  try {
    const { oldPassword, newPassword, confirmPassword } = req.body;

    if (!oldPassword || !newPassword || !confirmPassword) {
      return ResponseHandler.error(res, 'Vui lòng điền đầy đủ thông tin', 400);
    }

    if (newPassword.length < 8) {
      return ResponseHandler.error(res, 'Mật khẩu mới phải có ít nhất 8 ký tự', 400);
    }

    if (newPassword !== confirmPassword) {
      return ResponseHandler.error(res, 'Xác nhận mật khẩu không khớp', 400);
    }

    const userId = req.user!.id;

    // Get current user password
    const result = await pool.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [userId]
    );

    const user = result.rows[0];

    // Verify old password
    const isValidPassword = await bcrypt.compare(oldPassword, user.password_hash);

    if (!isValidPassword) {
      logger.warn('[ChangePassword] Invalid old password', { userId, ip: req.ip });
      return ResponseHandler.error(res, 'Mật khẩu cũ không đúng', 400);
    }

    // Update password
    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [
      newPasswordHash,
      userId,
    ]);

    auditLog('PASSWORD_CHANGED', {
      userId,
      ip: req.ip,
    });

    logger.info('[ChangePassword] Password changed successfully', { userId });

    return ResponseHandler.success(res, null, 'Đổi mật khẩu thành công');
  } catch (error: any) {
    return ResponseHandler.internalError(res, 'Lỗi khi đổi mật khẩu', error);
  }
};

// Get current user
export const getCurrentUser = async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT id, email, phone, full_name, role, created_at FROM users WHERE id = $1',
      [req.user!.id]
    );

    if (result.rows.length === 0) {
      return ResponseHandler.notFound(res, 'Người dùng không tồn tại');
    }

    const responseData: AuthResponse = {
      user: result.rows[0],
    };

    return ResponseHandler.success(res, responseData, 'Lấy thông tin user thành công');
  } catch (error: any) {
    return ResponseHandler.internalError(res, 'Lỗi khi lấy thông tin user', error);
  }
};

// Reset Password (sau khi có code từ forgot-password)
export const resetPassword = async (req: AuthRequest, res: Response) => {
  try {
    const validated = resetPasswordSchema.parse(req.body);
    const { code, email, phone, newPassword } = validated;

    // Find user
    const userResult = await pool.query(
      'SELECT id FROM users WHERE email = $1 OR phone = $2',
      [email, phone]
    );

    if (userResult.rows.length === 0) {
      logger.warn('[ResetPassword] User not found', { email, phone, ip: req.ip });
      return ResponseHandler.notFound(res, 'Tài khoản không tồn tại');
    }

    const userId = userResult.rows[0].id;

    // Verify reset code
    const isValid = await verifyCode(userId, code, 'password_reset');

    if (!isValid) {
      logger.warn('[ResetPassword] Invalid code', { userId, email, phone, ip: req.ip });
      return ResponseHandler.error(
        res,
        'Mã xác thực không đúng hoặc đã hết hạn',
        400,
        { code: 'INVALID_CODE', details: { suggestion: 'Vui lòng yêu cầu gửi lại mã đặt lại mật khẩu' } }
      );
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Update password
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [
      passwordHash,
      userId,
    ]);

    auditLog('PASSWORD_RESET', {
      userId,
      email,
      phone,
      ip: req.ip,
    });

    logger.info('[ResetPassword] Password reset successfully', { userId, email, phone });

    return ResponseHandler.success(res, null, 'Đặt lại mật khẩu thành công');
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return ResponseHandler.validationError(res, error.errors);
    }
    return ResponseHandler.internalError(res, 'Lỗi khi đặt lại mật khẩu', error);
  }
};

// Logout
export const logout = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    // Với JWT stateless, logout chủ yếu là client-side (xóa token)
    // Nếu cần server-side logout, có thể thêm blacklist token vào database
    // Hoặc sử dụng Redis để lưu blacklist tokens
    
    // TODO: Có thể thêm logic blacklist token nếu cần
    // const token = req.headers.authorization?.split(' ')[1];
    // await addTokenToBlacklist(token);

    auditLog('USER_LOGOUT', {
      userId,
      ip: req.ip,
    });

    logger.info('[Logout] User logged out', { userId });

    return ResponseHandler.success(res, null, 'Đăng xuất thành công');
  } catch (error: any) {
    return ResponseHandler.internalError(res, 'Lỗi khi đăng xuất', error);
  }
};

// Update Profile
export const updateProfile = async (req: AuthRequest, res: Response) => {
  try {
    const validated = updateProfileSchema.parse(req.body);
    const { full_name, email, phone } = validated;
    const userId = req.user!.id;

    // Check if email or phone is already taken by another user
    if (email || phone) {
      const existingUser = await pool.query(
        'SELECT id FROM users WHERE (email = $1 OR phone = $2) AND id != $3',
        [email || null, phone || null, userId]
      );

      if (existingUser.rows.length > 0) {
        logger.warn('[UpdateProfile] Email or phone already taken', { userId, email, phone });
        return ResponseHandler.conflict(
          res,
          'Email hoặc số điện thoại đã được sử dụng bởi tài khoản khác'
        );
      }
    }

    // Build update query dynamically
    const updateFields: string[] = [];
    const values: any[] = [];
    let paramCount = 0;

    if (full_name !== undefined) {
      paramCount++;
      updateFields.push(`full_name = $${paramCount}`);
      values.push(full_name);
    }

    if (email !== undefined) {
      paramCount++;
      updateFields.push(`email = $${paramCount}`);
      values.push(email);
    }

    if (phone !== undefined) {
      paramCount++;
      updateFields.push(`phone = $${paramCount}`);
      values.push(phone);
    }

    if (updateFields.length === 0) {
      return ResponseHandler.error(res, 'Không có trường nào để cập nhật', 400);
    }

    paramCount++;
    updateFields.push(`updated_at = NOW()`);
    paramCount++;
    values.push(userId);

    const result = await pool.query(
      `UPDATE users SET ${updateFields.join(', ')} WHERE id = $${paramCount} RETURNING id, email, phone, full_name, role`,
      values
    );

    auditLog('PROFILE_UPDATED', {
      userId,
      updates: { full_name, email, phone },
      ip: req.ip,
    });

    logger.info('[UpdateProfile] Profile updated successfully', { userId, updates: { full_name, email, phone } });

    const responseData: AuthResponse = {
      user: result.rows[0],
    };

    return ResponseHandler.success(res, responseData, 'Cập nhật thông tin thành công');
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return ResponseHandler.validationError(res, error.errors);
    }
    return ResponseHandler.internalError(res, 'Lỗi khi cập nhật thông tin', error);
  }
};

// Verify Password (re-authenticate cho các thao tác nhạy cảm)
export const verifyPassword = async (req: AuthRequest, res: Response) => {
  try {
    const validated = verifyPasswordSchema.parse(req.body);
    const { password } = validated;
    const userId = req.user!.id;

    // Get user password
    const result = await pool.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return ResponseHandler.notFound(res, 'Người dùng không tồn tại');
    }

    const user = result.rows[0];

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      logger.warn('[VerifyPassword] Invalid password', { userId, ip: req.ip });
      return ResponseHandler.unauthorized(res, 'Mật khẩu không đúng');
    }

    logger.info('[VerifyPassword] Password verified successfully', { userId });

    return ResponseHandler.success(res, { verified: true }, 'Xác thực mật khẩu thành công');
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return ResponseHandler.validationError(res, error.errors);
    }
    return ResponseHandler.internalError(res, 'Lỗi khi xác thực mật khẩu', error);
  }
};

// Refresh Token
export const refreshToken = async (req: AuthRequest, res: Response) => {
  try {
    const validated = refreshTokenSchema.parse(req.body);
    const { refreshToken } = validated;

    // Verify refresh token
    try {
      const decoded = jwt.verify(refreshToken, appConfig.jwtSecret) as any;
      
      // Verify this is a refresh token (has type: 'refresh')
      if (decoded.type !== 'refresh') {
        logger.warn('[RefreshToken] Invalid token type', { ip: req.ip });
        return ResponseHandler.unauthorized(res, 'Token không phải là refresh token');
      }
      
      // Verify user still exists and is active
      const result = await pool.query(
        'SELECT id, email, phone, role, is_active, is_banned FROM users WHERE id = $1',
        [decoded.userId]
      );

      if (result.rows.length === 0) {
        return ResponseHandler.unauthorized(res, 'Người dùng không tồn tại');
      }

      const user = result.rows[0];

      if (!user.is_active || user.is_banned) {
        logger.warn('[RefreshToken] Account banned or inactive', { userId: user.id });
        return ResponseHandler.forbidden(res, 'Tài khoản đã bị khóa');
      }

      // Generate new access token
      const newToken = jwt.sign(
        { userId: user.id, role: user.role },
        appConfig.jwtSecret as string,
        { expiresIn: appConfig.jwtExpiresIn } as any
      );

      // Generate new refresh token
      const newRefreshToken = jwt.sign(
        { userId: user.id, role: user.role, type: 'refresh' },
        appConfig.jwtSecret as string,
        { expiresIn: '30d' } as any
      );

      logger.info('[RefreshToken] Token refreshed successfully', { userId: user.id });

      const responseData: RefreshTokenResponse = {
        token: newToken,
        refreshToken: newRefreshToken,
      };

      return ResponseHandler.success(res, responseData, 'Làm mới token thành công');
    } catch (jwtError) {
      logger.warn('[RefreshToken] Invalid or expired token', { ip: req.ip });
      return ResponseHandler.unauthorized(res, 'Refresh token không hợp lệ hoặc đã hết hạn');
    }
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return ResponseHandler.validationError(res, error.errors);
    }
    return ResponseHandler.internalError(res, 'Lỗi khi làm mới token', error);
  }
};

// Deactivate Account (Vô hiệu hóa tài khoản)
export const deactivateAccount = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    // Check if account is already deactivated
    const userCheck = await pool.query(
      'SELECT is_active FROM users WHERE id = $1',
      [userId]
    );

    if (userCheck.rows.length === 0) {
      return ResponseHandler.notFound(res, 'Người dùng không tồn tại');
    }

    if (!userCheck.rows[0].is_active) {
      return ResponseHandler.error(res, 'Tài khoản đã bị vô hiệu hóa', 400);
    }

    // Soft delete: Set is_active to false
    await pool.query(
      'UPDATE users SET is_active = FALSE, updated_at = NOW() WHERE id = $1',
      [userId]
    );

    auditLog('ACCOUNT_DEACTIVATED', {
      userId,
      ip: req.ip,
    });

    logger.info('[DeactivateAccount] Account deactivated successfully', { userId });

    return ResponseHandler.success(res, null, 'Vô hiệu hóa tài khoản thành công');
  } catch (error: any) {
    return ResponseHandler.internalError(res, 'Lỗi khi vô hiệu hóa tài khoản', error);
  }
};

// Verify Firebase Phone Auth
export const verifyFirebasePhone = async (req: AuthRequest, res: Response) => {
  try {
    logger.info('[VerifyFirebasePhone] Starting Firebase phone verification', {
      ip: req.ip,
      hasIdToken: !!req.body.idToken,
      hasPhone: !!req.body.phone,
      hasEmail: !!req.body.email,
      hasPassword: !!req.body.password,
    });

    const { idToken, phone, email, password } = req.body;

    if (!idToken) {
      logger.warn('[VerifyFirebasePhone] Missing Firebase ID token', { ip: req.ip });
      return ResponseHandler.error(res, 'Firebase ID token không được để trống', 400);
    }

    // Verify Firebase ID token
    logger.info('[VerifyFirebasePhone] Verifying Firebase ID token...');
    const decodedToken = await verifyFirebaseToken(idToken);

    logger.info('[VerifyFirebasePhone] Firebase token verified, checking phone number match', {
      tokenPhone: decodedToken.phone_number,
      providedPhone: phone,
    });

    // Verify phone number matches
    if (phone && decodedToken.phone_number !== phone) {
      logger.warn('[VerifyFirebasePhone] Phone number mismatch', { 
        tokenPhone: decodedToken.phone_number, 
        providedPhone: phone,
        ip: req.ip,
      });
      return ResponseHandler.error(res, 'Số điện thoại không khớp với token', 400);
    }

    const phoneNumber = decodedToken.phone_number || phone;
    const userEmail = decodedToken.email || email;

    logger.info('[VerifyFirebasePhone] Searching for existing user', {
      phone: phoneNumber,
      email: userEmail,
    });

    // Find or create user
    let userResult = await pool.query(
      'SELECT id, email, phone, role, is_verified FROM users WHERE phone = $1 OR email = $2',
      [phoneNumber, userEmail]
    );

    let user;
    if (userResult.rows.length === 0) {
      logger.info('[VerifyFirebasePhone] User not found, creating new user', {
        phone: phoneNumber,
        email: userEmail,
      });

      // Hash password if provided (for registration)
      let passwordHash = null;
      if (password) {
        logger.info('[VerifyFirebasePhone] Hashing password for new user');
        passwordHash = await bcrypt.hash(password, 10);
      }

      // Create new user if doesn't exist
      const result = await pool.query(
        `INSERT INTO users (email, phone, password_hash, is_verified)
         VALUES ($1, $2, $3, TRUE)
         RETURNING id, email, phone, role`,
        [userEmail, phoneNumber, passwordHash]
      );
      user = result.rows[0];
      
      logger.info('[VerifyFirebasePhone] New user created successfully', {
        userId: user.id,
        phone: user.phone,
        email: user.email,
      });
      
      auditLog('USER_REGISTERED_VIA_FIREBASE', {
        userId: user.id,
        phone: phoneNumber,
        email: userEmail,
        ip: req.ip,
      });
    } else {
      user = userResult.rows[0];
      
      logger.info('[VerifyFirebasePhone] Existing user found', {
        userId: user.id,
        phone: user.phone,
        email: user.email,
        isVerified: user.is_verified,
      });
      
      // Update user as verified if not already
      if (!user.is_verified) {
        logger.info('[VerifyFirebasePhone] Updating user verification status', { userId: user.id });
        await pool.query('UPDATE users SET is_verified = TRUE WHERE id = $1', [user.id]);
        user.is_verified = true;
      }
    }

    // Check if user is active and not banned
    const userStatus = await pool.query(
      'SELECT is_active, is_banned FROM users WHERE id = $1',
      [user.id]
    );

    if (userStatus.rows.length > 0) {
      const { is_active, is_banned } = userStatus.rows[0];
      if (!is_active || is_banned) {
        logger.warn('[VerifyFirebasePhone] Account is inactive or banned', {
          userId: user.id,
          is_active,
          is_banned,
          ip: req.ip,
        });
        return ResponseHandler.forbidden(res, 'Tài khoản đã bị khóa');
      }
    }

    logger.info('[VerifyFirebasePhone] Generating JWT tokens', { userId: user.id });

    // Generate JWT access token
    const token = jwt.sign(
      { userId: user.id, role: user.role },
      appConfig.jwtSecret as string,
      { expiresIn: appConfig.jwtExpiresIn } as any
    );

    // Generate refresh token
    const refreshToken = jwt.sign(
      { userId: user.id, role: user.role, type: 'refresh' },
      appConfig.jwtSecret as string,
      { expiresIn: '30d' } as any
    );

    auditLog('USER_VERIFIED_VIA_FIREBASE', {
      userId: user.id,
      phone: phoneNumber,
      email: userEmail,
      ip: req.ip,
    });

    logger.info('[VerifyFirebasePhone] Phone verified successfully', { 
      userId: user.id, 
      phone: phoneNumber,
      email: userEmail,
      role: user.role,
    });

    const responseData: LoginResponse = {
      token,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
    };

    return ResponseHandler.success(res, responseData, 'Xác thực số điện thoại thành công');
  } catch (error: any) {
    logger.error('[VerifyFirebasePhone] Error during Firebase phone verification', {
      error: error.message,
      code: error.code,
      name: error.name,
      stack: error.stack,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi xác thực số điện thoại', error);
  }
};

// Delete Account (Xóa tài khoản - cần verify password)
export const deleteAccount = async (req: AuthRequest, res: Response) => {
  try {
    const validated = deleteAccountSchema.parse(req.body);
    const { password } = validated;
    const userId = req.user!.id;

    // Verify password
    const result = await pool.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return ResponseHandler.notFound(res, 'Người dùng không tồn tại');
    }

    const user = result.rows[0];

    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      logger.warn('[DeleteAccount] Invalid password', { userId, ip: req.ip });
      return ResponseHandler.unauthorized(res, 'Mật khẩu không đúng');
    }

    // Soft delete: Set is_active to false and mark as deleted
    // Hoặc hard delete nếu muốn (DELETE FROM users)
    // Ở đây dùng soft delete để giữ lại dữ liệu lịch sử
    await pool.query(
      `UPDATE users 
       SET is_active = FALSE, is_banned = TRUE, 
       email = CONCAT(email, '_deleted_', EXTRACT(EPOCH FROM NOW())),
       phone = NULL,
       updated_at = NOW()
       WHERE id = $1`,
      [userId]
    );

    auditLog('ACCOUNT_DELETED', {
      userId,
      ip: req.ip,
    });

    logger.warn('[DeleteAccount] Account deleted successfully', { userId });

    return ResponseHandler.success(res, null, 'Xóa tài khoản thành công');
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return ResponseHandler.validationError(res, error.errors);
    }
    return ResponseHandler.internalError(res, 'Lỗi khi xóa tài khoản', error);
  }
};

