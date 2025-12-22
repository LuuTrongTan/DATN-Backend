import admin from 'firebase-admin';
import { smsConfig } from '../config/app.config';
import { logger } from '../../utils/logging';

let firebaseApp: admin.app.App | null = null;

/**
 * Initialize Firebase Admin SDK
 */
export const initializeFirebase = (): void => {
  try {
    if (firebaseApp) {
      logger.info('[Firebase] Firebase Admin already initialized');
      return;
    }

    logger.info('[Firebase] Starting Firebase Admin initialization...');

    if (!smsConfig.firebaseProjectId || !smsConfig.firebasePrivateKey || !smsConfig.firebaseClientEmail) {
      logger.warn('[Firebase] Firebase credentials not configured. Firebase Admin will not be initialized.', {
        hasProjectId: !!smsConfig.firebaseProjectId,
        hasPrivateKey: !!smsConfig.firebasePrivateKey,
        hasClientEmail: !!smsConfig.firebaseClientEmail,
      });
      return;
    }

    logger.info('[Firebase] Firebase credentials found, parsing private key...');

    // Parse private key (replace \\n with actual newlines)
    const privateKey = smsConfig.firebasePrivateKey.replace(/\\n/g, '\n');

    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: smsConfig.firebaseProjectId,
        privateKey,
        clientEmail: smsConfig.firebaseClientEmail,
      }),
    });

    logger.info('[Firebase] Firebase Admin initialized successfully', {
      projectId: smsConfig.firebaseProjectId,
    });
  } catch (error: any) {
    logger.error('[Firebase] Failed to initialize Firebase Admin', {
      error: error.message,
      stack: error.stack,
      code: error.code,
      name: error.name,
    });
    throw new Error('Không thể khởi tạo Firebase Admin. Vui lòng kiểm tra cấu hình.');
  }
};

/**
 * Get Firebase Admin instance
 */
export const getFirebaseAdmin = (): admin.app.App => {
  if (!firebaseApp) {
    logger.error('[Firebase] Attempted to get Firebase Admin but it is not initialized');
    throw new Error('Firebase Admin chưa được khởi tạo. Vui lòng gọi initializeFirebase() trước.');
  }
  return firebaseApp;
};

/**
 * Verify Firebase ID token
 * @param idToken Firebase ID token from client
 * @returns Decoded token with user info
 */
export const verifyFirebaseToken = async (idToken: string): Promise<admin.auth.DecodedIdToken> => {
  try {
    logger.info('[Firebase] Verifying Firebase ID token...');
    
    if (!idToken || idToken.trim().length === 0) {
      logger.warn('[Firebase] Empty or invalid ID token provided');
      throw new Error('Token không được cung cấp');
    }

    const admin = getFirebaseAdmin();
    
    logger.debug('[Firebase] Calling Firebase Admin verifyIdToken...', {
      tokenLength: idToken.length,
      tokenPrefix: idToken.substring(0, 20) + '...',
    });

    const decodedToken = await admin.auth().verifyIdToken(idToken);
    
    logger.info('[Firebase] Firebase ID token verified successfully', {
      uid: decodedToken.uid,
      phoneNumber: decodedToken.phone_number || 'N/A',
      email: decodedToken.email || 'N/A',
      authTime: decodedToken.auth_time,
      issuedAt: decodedToken.iat,
      expiresAt: decodedToken.exp,
    });

    return decodedToken;
  } catch (error: any) {
    logger.error('[Firebase] Failed to verify Firebase token', {
      error: error.message,
      code: error.code,
      name: error.name,
      stack: error.stack,
    });

    // Map Firebase error codes to user-friendly messages
    let errorMessage = 'Token không hợp lệ hoặc đã hết hạn';
    if (error.code === 'auth/id-token-expired') {
      errorMessage = 'Token đã hết hạn';
    } else if (error.code === 'auth/id-token-revoked') {
      errorMessage = 'Token đã bị thu hồi';
    } else if (error.code === 'auth/argument-error') {
      errorMessage = 'Token không hợp lệ';
    }

    throw new Error(errorMessage);
  }
};

/**
 * Get user by phone number from Firebase
 * @param phoneNumber Phone number (with country code, e.g., +84912345678)
 * @returns User record or null
 */
export const getFirebaseUserByPhone = async (phoneNumber: string): Promise<admin.auth.UserRecord | null> => {
  try {
    logger.info('[Firebase] Getting Firebase user by phone number', { phoneNumber });
    
    if (!phoneNumber || phoneNumber.trim().length === 0) {
      logger.warn('[Firebase] Empty phone number provided');
      throw new Error('Số điện thoại không được cung cấp');
    }

    const admin = getFirebaseAdmin();
    const user = await admin.auth().getUserByPhoneNumber(phoneNumber);
    
    logger.info('[Firebase] Firebase user found by phone number', {
      uid: user.uid,
      phoneNumber: user.phoneNumber,
      email: user.email || 'N/A',
      emailVerified: user.emailVerified,
      disabled: user.disabled,
    });

    return user;
  } catch (error: any) {
    if (error.code === 'auth/user-not-found') {
      logger.info('[Firebase] Firebase user not found by phone number', { phoneNumber });
      return null;
    }
    
    logger.error('[Firebase] Failed to get Firebase user by phone', {
      phoneNumber,
      error: error.message,
      code: error.code,
      name: error.name,
      stack: error.stack,
    });
    
    throw error;
  }
};

export default firebaseApp;

