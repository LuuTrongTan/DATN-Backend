import { Pool, QueryResult } from 'pg';
import { dbConfig } from '../config/database.config';
import { logger } from '../../utils/logging';

export const pool = new Pool(dbConfig);

pool.on('error', (err: Error) => {
  logger.error('Unexpected error on idle client', { error: err.message, stack: err.stack });
  process.exit(-1);
});

/**
 * Connect to database and verify connection with retry logic
 * @returns Promise that resolves when database is connected
 */
export const connectDatabase = async (maxRetries: number = 10, retryDelay: number = 2000): Promise<void> => {
  let lastError: any;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await pool.query('SELECT NOW()');
      logger.info('Database connected successfully');
      return Promise.resolve();
    } catch (err: any) {
      lastError = err;
      if (attempt < maxRetries) {
        logger.warn(`Database connection attempt ${attempt}/${maxRetries} failed, retrying in ${retryDelay}ms...`, { error: err.message });
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      } else {
        logger.error(`Database connection error after ${maxRetries} attempts:`, { error: err.message, stack: err.stack });
        throw err;
      }
    }
  }
  
  throw lastError;
};

