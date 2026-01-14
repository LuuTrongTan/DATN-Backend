import { Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../../connections';
import { AuthRequest } from '../../types/request.types';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  updateProfileSchema,
  verifyPasswordSchema,
  refreshTokenSchema,
  deleteAccountSchema,
  addRecoveryEmailSchema,
  changePasswordSchema,
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
import { USER_STATUS, USER_ROLE } from '../../constants';

// UC-01: Đăng ký chỉ bằng số điện thoại (bắt buộc Firebase ID token)
export const register = async (req: AuthRequest, res: Response) => {
  try {
    const validated = registerSchema.parse(req.body);
    const { phone, password, idToken } = validated;

    logger.info('[Register] Starting phone registration', {
      phone,
      hasIdToken: !!idToken,
      ip: req.ip,
    });

    // Verify Firebase ID token (bắt buộc)
    let verifiedPhone: string | null = null;
    try {
      logger.info('[Register] Verifying Firebase ID token...');
      const decodedToken = await verifyFirebaseToken(idToken);

      // Verify phone number matches
      if (!decodedToken.phone_number) {
        logger.warn('[Register] Firebase token does not contain phone number', { ip: req.ip });
        return ResponseHandler.error(
          res,
          'Firebase token không chứa số điện thoại. Vui lòng xác thực số điện thoại trước.',
          400
        );
      }

      // Kiểm tra phone number trong token khớp với phone trong request
      // Firebase trả về phone với format +84..., cần convert về 10 số
      const tokenPhone = decodedToken.phone_number.replace(/^\+84/, '0');
      if (tokenPhone !== phone) {
        logger.warn('[Register] Phone number mismatch', {
          tokenPhone,
          providedPhone: phone,
          ip: req.ip,
        });
        return ResponseHandler.error(
          res,
          'Số điện thoại không khớp với token Firebase',
          400
        );
      }

      verifiedPhone = phone;

      logger.info('[Register] Firebase token verified successfully', {
        phone: verifiedPhone,
      });
    } catch (firebaseError: any) {
      logger.error('[Register] Firebase verification failed', {
        error: firebaseError.message,
        ip: req.ip,
      });
      return ResponseHandler.error(
        res,
        'Xác thực Firebase thất bại: ' + firebaseError.message,
        400
      );
    }

    // Check if user already exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE phone = $1',
      [verifiedPhone]
    );

    if (existingUser.rows.length > 0) {
      logger.warn('[Register] User already exists', { phone: verifiedPhone, ip: req.ip });
      return ResponseHandler.conflict(
        res,
        'Số điện thoại đã được đăng ký',
        { suggestion: 'Vui lòng đăng nhập hoặc sử dụng số điện thoại khác' }
      );
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user với phone đã được verify qua Firebase
    const result = await pool.query(
      `INSERT INTO users (email, phone, password_hash, phone_verified, status)
       VALUES (NULL, $1, $2, TRUE, $3)
       RETURNING id, email, phone, role`,
      [verifiedPhone, passwordHash, USER_STATUS.ACTIVE]
    );

    const user = result.rows[0];

    auditLog('USER_REGISTERED', {
      userId: user.id,
      phone: verifiedPhone,
      ip: req.ip,
    });

    logger.info('[Register] User registered successfully', {
      userId: user.id,
      phone: verifiedPhone,
    });

    // Ensure user.id is string (UUID from PostgreSQL)
    const userId = String(user.id);

    // Generate JWT access token (phone đã verify nên trả token ngay)
    const token = jwt.sign(
      { userId, role: user.role },
      appConfig.jwtSecret as string,
      { expiresIn: appConfig.jwtExpiresIn } as any
    );

    // Generate refresh token
    const refreshToken = jwt.sign(
      { userId, role: user.role, type: 'refresh' },
      appConfig.jwtSecret as string,
      { expiresIn: '30d' } as any
    );

    // Fetch full user data including full_name and verification status
    const fullUserResult = await pool.query(
      'SELECT id, email, phone, full_name, role, email_verified, phone_verified, created_at FROM users WHERE id = $1',
      [user.id]
    );
    const fullUser = fullUserResult.rows[0];

    const responseData: LoginResponse = {
      token,
      refreshToken,
      user: {
        id: fullUser.id,
        email: fullUser.email,
        phone: fullUser.phone,
        full_name: fullUser.full_name,
        role: fullUser.role,
        email_verified: fullUser.email_verified,
        phone_verified: fullUser.phone_verified,
        created_at: fullUser.created_at,
      },
    };

    return ResponseHandler.success(
      res,
      responseData,
      'Đăng ký thành công. Số điện thoại đã được xác thực.'
    );
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return ResponseHandler.validationError(res, error.errors);
    }
    logger.error('[Register] Registration error', {
      error: error.message,
      stack: error.stack,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi đăng ký', error);
  }
};

// UC-02: Gửi lại mã xác nhận
export const resendVerification = async (req: AuthRequest, res: Response) => {
  const { email, phone } = req.body;
  try {

    if (!email && !phone) {
      return ResponseHandler.error(res, 'Phải cung cấp email hoặc số điện thoại', 400);
    }

    const result = await pool.query(
      'SELECT id, email, phone, phone_verified, email_verified FROM users WHERE email = $1 OR phone = $2',
      [email, phone]
    );

    if (result.rows.length === 0) {
      logger.warn('[ResendVerification] User not found', { email, phone, ip: req.ip });
      return ResponseHandler.notFound(res, 'Tài khoản không tồn tại');
    }

    const user = result.rows[0];

    if ((email && user.email_verified) || (phone && user.phone_verified)) {
      return ResponseHandler.error(res, 'Tài khoản đã được xác thực', 400);
    }

    // Check rate limit (1 minute cooldown)
    const recentCode = await pool.query(
      `SELECT created_at FROM verification_codes
       WHERE user_id = $1 AND type IN ('verify_email', 'phone')
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
    const verificationType = email ? 'verify_email' : 'phone';
    
    await saveVerificationCode(user.id, code, verificationType, 10, email || phone);

    if (email) {
      await sendVerificationEmail(email, code, 'verification');
    } else if (phone) {
      // With Firebase Phone Auth, SMS is sent from frontend
      logger.info('[ResendVerification] Phone verification - Firebase Phone Auth should be used on frontend', { phone });
    }

    logger.info('[ResendVerification] Code sent successfully', { userId: user.id, email, phone });

    return ResponseHandler.success(res, null, 'Đã gửi lại mã xác nhận thành công');
  } catch (error: any) {
    logger.error('[ResendVerification] Error resending verification code', {
      error: error.message,
      stack: error.stack,
      email,
      phone,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi gửi lại mã xác nhận', error);
  }
};

// UC-03: Xác thực
export const verify = async (req: AuthRequest, res: Response) => {
  const { code, email, phone } = req.body;
  try {

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
    const verificationType = email ? 'verify_email' : 'phone';

    const isValid = await verifyCode(userId, code, verificationType, email || phone);

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
    if (email) {
      await pool.query('UPDATE users SET email_verified = TRUE WHERE id = $1', [userId]);
    } else if (phone) {
      await pool.query('UPDATE users SET phone_verified = TRUE WHERE id = $1', [userId]);
    }

    auditLog('USER_VERIFIED', {
      userId,
      email,
      phone,
      ip: req.ip,
    });

    logger.info('[Verify] Account verified successfully', { userId, email, phone });

    return ResponseHandler.success(res, null, 'Xác thực thành công');
  } catch (error: any) {
    logger.error('[Verify] Error verifying account', {
      error: error.message,
      stack: error.stack,
      email,
      phone,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi xác thực', error);
  }
};

// UC-04: Quên mật khẩu
// - Nếu dùng phone: phải có idToken + newPassword → Reset password ngay (Firebase Phone Auth)
// - Nếu dùng email: chỉ cần email → Gửi code OTP qua email
export const forgotPassword = async (req: AuthRequest, res: Response) => {
  try {
    const validated = forgotPasswordSchema.parse(req.body);
    const { email, phone, idToken, newPassword } = validated;

    logger.info('[ForgotPassword] Starting password recovery', {
      hasEmail: !!email,
      hasPhone: !!phone,
      hasIdToken: !!idToken,
      hasNewPassword: !!newPassword,
      ip: req.ip,
    });

    // Trường hợp 1: Quên mật khẩu qua Phone với Firebase (reset ngay)
    if (phone && idToken && newPassword) {
      logger.info('[ForgotPassword] Using Firebase Phone Auth for password recovery');

      // Verify Firebase ID token
      let verifiedPhone: string | null = null;
      try {
        logger.info('[ForgotPassword] Verifying Firebase ID token...');
        const decodedToken = await verifyFirebaseToken(idToken);

        // Verify phone number exists in token
        if (!decodedToken.phone_number) {
          logger.warn('[ForgotPassword] Firebase token does not contain phone number', { ip: req.ip });
          return ResponseHandler.error(
            res,
            'Firebase token không chứa số điện thoại. Vui lòng xác thực số điện thoại trước.',
            400
          );
        }

        // Convert Firebase phone format (+84...) to local format (0...)
        const tokenPhone = decodedToken.phone_number.replace(/^\+84/, '0');
        if (tokenPhone !== phone) {
          logger.warn('[ForgotPassword] Phone number mismatch', {
            tokenPhone,
            providedPhone: phone,
            ip: req.ip,
          });
          return ResponseHandler.error(
            res,
            'Số điện thoại không khớp với token Firebase',
            400
          );
        }

        verifiedPhone = phone;

        logger.info('[ForgotPassword] Firebase token verified successfully', {
          phone: verifiedPhone,
        });
      } catch (firebaseError: any) {
        logger.error('[ForgotPassword] Firebase verification failed', {
          error: firebaseError.message,
          ip: req.ip,
        });
        return ResponseHandler.error(
          res,
          'Xác thực Firebase thất bại: ' + firebaseError.message,
          400
        );
      }

      // Find user by phone
      const userResult = await pool.query(
        'SELECT id, email, phone, status FROM users WHERE phone = $1',
        [verifiedPhone]
      );

      if (userResult.rows.length === 0) {
        // Don't reveal that user doesn't exist for security
        logger.warn('[ForgotPassword] User not found', { phone: verifiedPhone, ip: req.ip });
        return ResponseHandler.success(
          res,
          null,
          'Nếu số điện thoại tồn tại trong hệ thống, mật khẩu đã được đặt lại thành công'
        );
      }

      const user = userResult.rows[0];

      // Check if account is active
      if (user.status !== USER_STATUS.ACTIVE) {
        logger.warn('[ForgotPassword] Account is not active', {
          userId: user.id,
          status: user.status,
          ip: req.ip,
        });
        return ResponseHandler.forbidden(res, 'Tài khoản đã bị khóa');
      }

      // Hash new password
      const passwordHash = await bcrypt.hash(newPassword, 10);

      // Update password
      await pool.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [
        passwordHash,
        user.id,
      ]);

      auditLog('PASSWORD_RESET_BY_PHONE', {
        userId: user.id,
        phone: verifiedPhone,
        ip: req.ip,
      });

      logger.info('[ForgotPassword] Password reset successfully via Firebase', {
        userId: user.id,
        phone: verifiedPhone,
      });

      return ResponseHandler.success(
        res,
        null,
        'Đặt lại mật khẩu thành công. Vui lòng đăng nhập với mật khẩu mới.'
      );
    }

    // Trường hợp 2: Quên mật khẩu qua Email (gửi code OTP)
    if (email) {
      logger.info('[ForgotPassword] Using email OTP for password recovery');

      const result = await pool.query(
        'SELECT id, email, phone FROM users WHERE email = $1',
        [email]
      );

      if (result.rows.length === 0) {
        // Don't reveal that user doesn't exist for security
        logger.warn('[ForgotPassword] User not found', { email, ip: req.ip });
        return ResponseHandler.success(res, null, 'Đã gửi mã đặt lại mật khẩu thành công');
      }

      const user = result.rows[0];

      // Generate reset code
        const code = generateCode();
        await saveVerificationCode(user.id, code, 'password_reset', 5, email);

      // Send verification email
      try {
        await sendVerificationEmail(email, code, 'password_reset');
        logger.info('[ForgotPassword] Verification email sent', { userId: user.id, email });
      } catch (emailError: any) {
        logger.error('[ForgotPassword] Failed to send verification email', {
          userId: user.id,
          email,
          error: emailError.message,
        });
        return ResponseHandler.error(
          res,
          'Không thể gửi email xác thực. Vui lòng thử lại sau.',
          500
        );
      }

      auditLog('PASSWORD_RESET_REQUESTED', {
        userId: user.id,
        email,
        ip: req.ip,
      });

      logger.info('[ForgotPassword] Reset code sent successfully via email', { userId: user.id, email });

      return ResponseHandler.success(res, null, 'Đã gửi mã đặt lại mật khẩu đến email của bạn');
    }

    // Nếu không có email hoặc phone hợp lệ
    return ResponseHandler.error(res, 'Phải cung cấp email hoặc số điện thoại với Firebase ID token', 400);
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return ResponseHandler.validationError(res, error.errors);
    }
    logger.error('[ForgotPassword] Password recovery error', {
      error: error.message,
      stack: error.stack,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi xử lý quên mật khẩu', error);
  }
};

// UC-05: Đăng nhập
export const login = async (req: AuthRequest, res: Response) => {
  try {
    const validated = loginSchema.parse(req.body);
    const { email, phone, password } = validated;

    // Find user
    const result = await pool.query(
      `SELECT id, email, phone, password_hash, role, status
       FROM users WHERE email = $1 OR phone = $2`,
      [email, phone]
    );

    if (result.rows.length === 0) {
      logger.warn('[Login] User not found', { email, phone, ip: req.ip });
      return ResponseHandler.unauthorized(res, 'Thông tin đăng nhập không đúng');
    }

    const user = result.rows[0];

    if (user.status !== USER_STATUS.ACTIVE) {
      logger.warn('[Login] Account not active', { userId: user.id, status: user.status, ip: req.ip });
      return ResponseHandler.forbidden(res, 'Tài khoản đã bị khóa');
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      logger.warn('[Login] Invalid password', { userId: user.id, ip: req.ip });
      return ResponseHandler.unauthorized(res, 'Thông tin đăng nhập không đúng');
    }

    // Ensure user.id is string (UUID from PostgreSQL)
    const userId = String(user.id);

    // Generate JWT access token
    const token = jwt.sign(
      { userId, role: user.role },
      appConfig.jwtSecret as string,
      { expiresIn: appConfig.jwtExpiresIn } as any
    );

    // Generate refresh token (longer expiry, e.g., 30 days)
    const refreshToken = jwt.sign(
      { userId, role: user.role, type: 'refresh' },
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

    // Fetch full user data including full_name and verification status
    const fullUserResult = await pool.query(
      'SELECT id, email, phone, full_name, role, email_verified, phone_verified, created_at FROM users WHERE id = $1',
      [user.id]
    );
    const fullUser = fullUserResult.rows[0];

    const responseData: LoginResponse = {
      token,
      refreshToken,
      user: {
        id: fullUser.id,
        email: fullUser.email,
        phone: fullUser.phone,
        full_name: fullUser.full_name,
        role: fullUser.role,
        email_verified: fullUser.email_verified,
        phone_verified: fullUser.phone_verified,
        created_at: fullUser.created_at,
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
    // Validate input với schema
    const validated = changePasswordSchema.parse(req.body);
    const { oldPassword, newPassword } = validated;

    const userId = String(req.user!.id);

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
    logger.error('[ChangePassword] Error changing password', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi đổi mật khẩu', error);
  }
};

// Get current user
export const getCurrentUser = async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT id, email, phone, full_name, role, email_verified, phone_verified, created_at FROM users WHERE id = $1',
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
    logger.error('[GetCurrentUser] Error getting current user', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi lấy thông tin user', error);
  }
};

// Reset Password (chỉ dùng cho email recovery với code OTP)
export const resetPassword = async (req: AuthRequest, res: Response) => {
  let email: string | undefined;
  try {
    const validated = resetPasswordSchema.parse(req.body);
    email = validated.email;
    const { code, newPassword } = validated;

    logger.info('[ResetPassword] Resetting password with OTP code', { email, ip: req.ip });

    // Find user by email
    const userResult = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (userResult.rows.length === 0) {
      logger.warn('[ResetPassword] User not found', { email, ip: req.ip });
      return ResponseHandler.notFound(res, 'Tài khoản không tồn tại');
    }

    const userId = userResult.rows[0].id;

    // Verify reset code
    const isValid = await verifyCode(userId, code, 'password_reset', email);

    if (!isValid) {
      logger.warn('[ResetPassword] Invalid code', { userId, email, ip: req.ip });
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
    await pool.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [
      passwordHash,
      userId,
    ]);

    auditLog('PASSWORD_RESET_BY_EMAIL', {
      userId,
      email,
      ip: req.ip,
    });

    logger.info('[ResetPassword] Password reset successfully', { userId, email });

    return ResponseHandler.success(res, null, 'Đặt lại mật khẩu thành công');
  } catch (error: any) {
    if (error.name === 'ZodError') {
      logger.warn('[ResetPassword] Validation error', {
        errors: error.errors,
        email,
        ip: req.ip,
      });
      return ResponseHandler.validationError(res, error.errors);
    }
    logger.error('[ResetPassword] Password reset error', {
      error: error.message,
      stack: error.stack,
      email,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi đặt lại mật khẩu', error);
  }
};

// Logout
export const logout = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    // Note: JWT logout strategy
    // - Current: Stateless JWT - logout is client-side (token removal)
    // - Optional enhancement: Server-side token blacklist for immediate invalidation
    //   Implementation options:
    //   1. Database table for blacklisted tokens (with expiration cleanup)
    //   2. Redis cache for blacklisted tokens (better performance)
    //   This is optional as JWT expiration handles most security needs
    //   Only implement if immediate token invalidation is required (e.g., security breach)

    auditLog('USER_LOGOUT', {
      userId,
      ip: req.ip,
    });

    logger.info('[Logout] User logged out', { userId });

    return ResponseHandler.success(res, null, 'Đăng xuất thành công');
  } catch (error: any) {
    logger.error('[Logout] Error during logout', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id,
      ip: req.ip,
    });
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
      // Reset email_verified khi email thay đổi (cast boolean để PostgreSQL nhận diện)
      updateFields.push(`email_verified = FALSE`);
    }

    if (phone !== undefined) {
      paramCount++;
      updateFields.push(`phone = $${paramCount}`);
      values.push(phone);
    }

    if (updateFields.length === 0) {
      return ResponseHandler.error(res, 'Không có trường nào để cập nhật', 400);
    }

    // updated_at không dùng parameter nên không tăng paramCount
    updateFields.push(`updated_at = NOW()`);
    paramCount++;
    values.push(userId);

    const result = await pool.query(
      `UPDATE users SET ${updateFields.join(', ')} WHERE id = $${paramCount} RETURNING id, email, phone, full_name, role, email_verified, phone_verified`,
      values
    );

    try {
      auditLog('PROFILE_UPDATED', {
        userId,
        updates: { full_name, email, phone },
        ip: req.ip,
      });
    } catch (auditError: any) {
      logger.warn('[UpdateProfile] Failed to log audit', { error: auditError.message });
    }

    logger.info('[UpdateProfile] Profile updated successfully', { userId, updates: { full_name, email, phone } });

    const responseData: AuthResponse = {
      user: result.rows[0],
    };

    return ResponseHandler.success(res, responseData, 'Cập nhật thông tin thành công');
  } catch (error: any) {
    logger.error('[UpdateProfile] Error updating profile', { 
      userId: req.user?.id, 
      error: error.message, 
      stack: error.stack,
      body: req.body 
    });
    
    if (error.name === 'ZodError') {
      return ResponseHandler.validationError(res, error.errors);
    }
    
    // Log chi tiết lỗi để debug
    if (error.code) {
      logger.error('[UpdateProfile] Database error', { code: error.code, detail: error.detail });
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
      logger.warn('[VerifyPassword] Validation error', {
        errors: error.errors,
        userId: req.user?.id,
        ip: req.ip,
      });
      return ResponseHandler.validationError(res, error.errors);
    }
    logger.error('[VerifyPassword] Error verifying password', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id,
      ip: req.ip,
    });
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
        'SELECT id, email, phone, role, status FROM users WHERE id = $1',
        [decoded.userId]
      );

      if (result.rows.length === 0) {
        return ResponseHandler.unauthorized(res, 'Người dùng không tồn tại');
      }

      const user = result.rows[0];

      if (user.status !== USER_STATUS.ACTIVE) {
        logger.warn('[RefreshToken] Account not active', { userId: user.id, status: user.status });
        return ResponseHandler.forbidden(res, 'Tài khoản đã bị khóa');
      }

      // Ensure user.id is string (UUID from PostgreSQL)
      const userId = String(user.id);

      // Generate new access token
      const newToken = jwt.sign(
        { userId, role: user.role },
        appConfig.jwtSecret as string,
        { expiresIn: appConfig.jwtExpiresIn } as any
      );

      // Generate new refresh token
      const newRefreshToken = jwt.sign(
        { userId, role: user.role, type: 'refresh' },
        appConfig.jwtSecret as string,
        { expiresIn: '30d' } as any
      );

      logger.info('[RefreshToken] Token refreshed successfully', { userId: user.id });

      const responseData: RefreshTokenResponse = {
        token: newToken,
        refreshToken: newRefreshToken,
      };

      return ResponseHandler.success(res, responseData, 'Làm mới token thành công');
    } catch (jwtError: any) {
      logger.warn('[RefreshToken] Invalid or expired token', {
        error: jwtError.message,
        stack: jwtError.stack,
        ip: req.ip,
      });
      return ResponseHandler.unauthorized(res, 'Refresh token không hợp lệ hoặc đã hết hạn');
    }
  } catch (error: any) {
    if (error.name === 'ZodError') {
      logger.warn('[RefreshToken] Validation error', {
        errors: error.errors,
        ip: req.ip,
      });
      return ResponseHandler.validationError(res, error.errors);
    }
    logger.error('[RefreshToken] Error refreshing token', {
      error: error.message,
      stack: error.stack,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi làm mới token', error);
  }
};

// Deactivate Account (Vô hiệu hóa tài khoản)
export const deactivateAccount = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    // Check if account is already deactivated
    const userCheck = await pool.query(
      'SELECT status FROM users WHERE id = $1',
      [userId]
    );

    if (userCheck.rows.length === 0) {
      return ResponseHandler.notFound(res, 'Người dùng không tồn tại');
    }

    if (userCheck.rows[0].status !== USER_STATUS.ACTIVE) {
      return ResponseHandler.error(res, 'Tài khoản đã bị vô hiệu hóa', 400);
    }

    // Soft delete: Set status to deleted
    await pool.query(
      'UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2',
      [USER_STATUS.DELETED, userId]
    );

    auditLog('ACCOUNT_DEACTIVATED', {
      userId,
      ip: req.ip,
    });

    logger.info('[DeactivateAccount] Account deactivated successfully', { userId });

    return ResponseHandler.success(res, null, 'Vô hiệu hóa tài khoản thành công');
  } catch (error: any) {
    logger.error('[DeactivateAccount] Error deactivating account', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id,
      ip: req.ip,
    });
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
      'SELECT id, email, phone, role, phone_verified, email_verified, status FROM users WHERE phone = $1 OR email = $2',
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
        `INSERT INTO users (email, phone, password_hash, phone_verified, email_verified, status)
         VALUES ($1, $2, $3, TRUE, TRUE, $4)
         RETURNING id, email, phone, role`,
        [userEmail, phoneNumber, passwordHash, USER_STATUS.ACTIVE]
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
        phone_verified: user.phone_verified,
        email_verified: user.email_verified,
        status: user.status,
      });
      
      // Update user as verified if not already
      if (!user.phone_verified) {
        logger.info('[VerifyFirebasePhone] Updating phone verification status', { userId: user.id });
        await pool.query('UPDATE users SET phone_verified = TRUE WHERE id = $1', [user.id]);
        user.phone_verified = true;
      }
    }

    // Check if user is active
    const userStatus = await pool.query(
      'SELECT status FROM users WHERE id = $1',
      [user.id]
    );

    if (userStatus.rows.length > 0) {
      const { status } = userStatus.rows[0];
      if (status !== USER_STATUS.ACTIVE) {
        logger.warn('[VerifyFirebasePhone] Account is not active', {
          userId: user.id,
          status,
          ip: req.ip,
        });
        return ResponseHandler.forbidden(res, 'Tài khoản đã bị khóa');
      }
    }

    // Ensure user.id is string (UUID from PostgreSQL)
    const userId = String(user.id);

    logger.info('[VerifyFirebasePhone] Generating JWT tokens', { userId });

    // Generate JWT access token
    const token = jwt.sign(
      { userId, role: user.role },
      appConfig.jwtSecret as string,
      { expiresIn: appConfig.jwtExpiresIn } as any
    );

    // Generate refresh token
    const refreshToken = jwt.sign(
      { userId, role: user.role, type: 'refresh' },
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

    // Fetch full user data including full_name and verification status
    const fullUserResult = await pool.query(
      'SELECT id, email, phone, full_name, role, email_verified, phone_verified, created_at FROM users WHERE id = $1',
      [user.id]
    );
    const fullUser = fullUserResult.rows[0];

    const responseData: LoginResponse = {
      token,
      refreshToken,
      user: {
        id: fullUser.id,
        email: fullUser.email,
        phone: fullUser.phone,
        full_name: fullUser.full_name,
        role: fullUser.role,
        email_verified: fullUser.email_verified,
        phone_verified: fullUser.phone_verified,
        created_at: fullUser.created_at,
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

// Add Recovery Email (Thêm email để khôi phục tài khoản)
export const addRecoveryEmail = async (req: AuthRequest, res: Response) => {
  let email: string | undefined;
  try {
    const validated = addRecoveryEmailSchema.parse(req.body);
    email = validated.email;
    const userId = String(req.user!.id);

    logger.info('[AddRecoveryEmail] Adding recovery email', { userId, email, ip: req.ip });

    // Check if email is already taken by another user
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1 AND id != $2',
      [email, userId]
    );

    if (existingUser.rows.length > 0) {
      logger.warn('[AddRecoveryEmail] Email already taken', { userId, email });
      return ResponseHandler.conflict(
        res,
        'Email đã được sử dụng bởi tài khoản khác'
      );
    }

    // Check if current user already has this email
    const currentUser = await pool.query(
      'SELECT email FROM users WHERE id = $1',
      [userId]
    );

    if (currentUser.rows.length > 0 && currentUser.rows[0].email === email) {
      return ResponseHandler.error(
        res,
        'Email này đã được liên kết với tài khoản của bạn',
        400
      );
    }

    // Generate verification code
    const code = generateCode();
    await saveVerificationCode(userId, code, 'verify_email', 10, email);

    // Send verification email
    try {
      await sendVerificationEmail(email, code, 'verification');
      logger.info('[AddRecoveryEmail] Verification email sent', { userId, email });
    } catch (emailError: any) {
      logger.error('[AddRecoveryEmail] Failed to send verification email', {
        userId,
        email,
        error: emailError.message,
      });
      return ResponseHandler.error(
        res,
        'Không thể gửi email xác thực. Vui lòng kiểm tra lại địa chỉ email.',
        500
      );
    }

    auditLog('RECOVERY_EMAIL_ADDED', {
      userId,
      email,
      ip: req.ip,
    });

    logger.info('[AddRecoveryEmail] Recovery email verification code sent', { userId, email });

    return ResponseHandler.success(
      res,
      { email },
      'Đã gửi mã xác thực đến email. Vui lòng kiểm tra email và xác thực để hoàn tất.'
    );
  } catch (error: any) {
    if (error.name === 'ZodError') {
      logger.warn('[AddRecoveryEmail] Validation error', {
        errors: error.errors,
        userId: req.user?.id,
        email,
        ip: req.ip,
      });
      return ResponseHandler.validationError(res, error.errors);
    }
    logger.error('[AddRecoveryEmail] Error adding recovery email', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id,
      email,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi thêm email khôi phục', error);
  }
};

// Verify Recovery Email (Xác thực email recovery và cập nhật vào tài khoản)
export const verifyRecoveryEmail = async (req: AuthRequest, res: Response) => {
  try {
    const { code, email } = req.body;
    const userId = String(req.user!.id);

    if (!code || !email) {
      return ResponseHandler.error(
        res,
        'Mã xác thực và email không được để trống',
        400
      );
    }

    logger.info('[VerifyRecoveryEmail] Verifying recovery email', { userId, email, ip: req.ip });

    // Verify code
    const isValid = await verifyCode(userId, code, 'verify_email', email);

    if (!isValid) {
      logger.warn('[VerifyRecoveryEmail] Invalid code', { userId, email, ip: req.ip });
      return ResponseHandler.error(
        res,
        'Mã xác thực không đúng hoặc đã hết hạn',
        400,
        { code: 'INVALID_CODE', details: { suggestion: 'Vui lòng yêu cầu gửi lại mã xác thực' } }
      );
    }

    // Check if email is already taken by another user
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1 AND id != $2',
      [email, userId]
    );

    if (existingUser.rows.length > 0) {
      logger.warn('[VerifyRecoveryEmail] Email already taken', { userId, email });
      return ResponseHandler.conflict(
        res,
        'Email đã được sử dụng bởi tài khoản khác'
      );
    }

    // Update user email
    await pool.query(
      'UPDATE users SET email = $1, updated_at = NOW() WHERE id = $2',
      [email, userId]
    );

    auditLog('RECOVERY_EMAIL_VERIFIED', {
      userId,
      email,
      ip: req.ip,
    });

    logger.info('[VerifyRecoveryEmail] Recovery email verified and updated', { userId, email });

    // Get updated user info
    const userResult = await pool.query(
      'SELECT id, email, phone, full_name, role FROM users WHERE id = $1',
      [userId]
    );

    const responseData: AuthResponse = {
      user: userResult.rows[0],
    };

    return ResponseHandler.success(
      res,
      responseData,
      'Email khôi phục đã được xác thực và cập nhật thành công'
    );
  } catch (error: any) {
    logger.error('[VerifyRecoveryEmail] Error verifying recovery email', {
      error: error.message,
      stack: error.stack,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi xác thực email khôi phục', error);
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

    // Soft delete: Set status to deleted
    await pool.query(
      `UPDATE users 
       SET status = $1,
       email = CONCAT(email, '_deleted_', EXTRACT(EPOCH FROM NOW())),
       phone = NULL,
       updated_at = NOW()
       WHERE id = $2`,
      [USER_STATUS.DELETED, userId]
    );

    auditLog('ACCOUNT_DELETED', {
      userId,
      ip: req.ip,
    });

    logger.warn('[DeleteAccount] Account deleted successfully', { userId });

    return ResponseHandler.success(res, null, 'Xóa tài khoản thành công');
  } catch (error: any) {
    if (error.name === 'ZodError') {
      logger.warn('[DeleteAccount] Validation error', {
        errors: error.errors,
        userId: req.user?.id,
        ip: req.ip,
      });
      return ResponseHandler.validationError(res, error.errors);
    }
    logger.error('[DeleteAccount] Error deleting account', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi xóa tài khoản', error);
  }
};

