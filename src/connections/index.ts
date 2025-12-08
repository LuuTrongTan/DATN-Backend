// Database
export { pool, migrate, connectDatabase } from './db';

// Redis
export { redisClient, connectRedis } from './redis';

// Firebase
export { initializeFirebase, getFirebaseAdmin, verifyFirebaseToken, getFirebaseUserByPhone } from './firebase';

// Config - All configurations in one place
export { 
  appConfig, 
  emailConfig, 
  smsConfig,
  dbConfig,
  redisConfig 
} from './config';

