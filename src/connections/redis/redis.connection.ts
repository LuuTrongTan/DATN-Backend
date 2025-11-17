import { createClient } from 'redis';
import { redisConfig } from '../config/redis.config';

const client = createClient({
  socket: {
    host: redisConfig.host,
    port: redisConfig.port,
  },
  password: redisConfig.password,
  database: redisConfig.db,
});

client.on('error', (err) => {
  console.error('Redis Client Error', err);
});

client.on('connect', () => {
  console.log('Redis connected successfully');
});

client.on('ready', () => {
  console.log('Redis client ready');
});

// Connect to Redis
const connectRedis = async () => {
  try {
    if (!client.isOpen) {
      await client.connect();
      console.log('Redis connected successfully');
    }
  } catch (err) {
    console.error('Failed to connect to Redis:', err);
  }
};

// Auto connect
connectRedis();

export const redisClient = client;

