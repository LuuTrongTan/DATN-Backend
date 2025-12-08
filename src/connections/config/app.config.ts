import dotenv from 'dotenv';

dotenv.config();

/**
 * Parse CORS origins from environment variable
 * Supports comma or space separated values
 */
const parseCorsOrigins = (): string[] => {
  const corsOrigins = process.env.CORS_ORIGINS || '';
  if (!corsOrigins) {
    return [];
  }
  
  // Split by comma or space, then trim and filter empty strings
  return corsOrigins
    .split(/[,\s]+/)
    .map(origin => origin.trim())
    .filter(origin => origin.length > 0);
};

export const appConfig = {
  port: parseInt(process.env.APP_PORT || process.env.PORT || '3000'),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  corsOrigins: parseCorsOrigins(),
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760'), // 10MB
  uploadDir: process.env.UPLOAD_DIR || './uploads',
};

export const emailConfig = {
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  user: process.env.SMTP_USER || '',
  pass: process.env.SMTP_PASS || '',
};

export const smsConfig = {
  // Firebase config (for phone authentication)
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID || '',
  firebasePrivateKey: process.env.FIREBASE_PRIVATE_KEY || '',
  firebaseClientEmail: process.env.FIREBASE_CLIENT_EMAIL || '',
};

