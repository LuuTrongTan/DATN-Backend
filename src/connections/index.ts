// Database
export { pool, migrate } from './db';

// Redis
export { redisClient } from './redis';

// Config - All configurations in one place
export { 
  appConfig, 
  emailConfig, 
  smsConfig,
  dbConfig,
  redisConfig 
} from './config';

