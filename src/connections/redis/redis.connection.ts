import { createClient } from 'redis';
import { redisConfig } from '../config/redis.config';
import { logger } from '../../utils/logging';

const client = createClient({
  socket: {
    host: redisConfig.host,
    port: redisConfig.port,
  },
  ...(redisConfig.password && { password: redisConfig.password }),
  database: redisConfig.db,
});

client.on('error', (err) => {
  logger.error('Redis Client Error', { error: err.message, stack: err.stack });
});

/**
 * Connect to Redis
 * @returns Promise that resolves when Redis is connected
 */
export const connectRedis = async (): Promise<void> => {
  try {
    if (!client.isOpen) {
      await client.connect();
      logger.info('Redis connected successfully');
    } else {
      logger.info('Redis already connected');
    }
    return Promise.resolve();
  } catch (err: any) {
    logger.error('Failed to connect to Redis:', { error: err.message, stack: err.stack });
    throw err;
  }
};

export const redisClient = client;

