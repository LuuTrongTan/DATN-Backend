import { Pool, Client } from 'pg';
import { dbConfig } from '../config/database.config';
import { logger } from '../../utils/logging';
import dotenv from 'dotenv';

dotenv.config();

// Connect to PostgreSQL server (not specific database) to drop/create database
const getAdminClient = (): Client => {
  return new Client({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
    database: 'postgres', // Connect to default postgres database
  });
};

// Drop database if exists
const dropDatabase = async (dbName: string): Promise<void> => {
  const client = getAdminClient();
  try {
    await client.connect();
    logger.info(`Dropping database ${dbName}...`);
    
    // Terminate all connections to the database first
    await client.query(`
      SELECT pg_terminate_backend(pg_stat_activity.pid)
      FROM pg_stat_activity
      WHERE pg_stat_activity.datname = $1
        AND pid <> pg_backend_pid();
    `, [dbName]);
    
    await client.query(`DROP DATABASE IF EXISTS ${dbName}`);
    logger.info(`Database ${dbName} dropped successfully`);
  } catch (error: any) {
    // Ignore error if database doesn't exist
    if (error.code === '3D000') {
      logger.info(`Database ${dbName} does not exist, skipping drop`);
    } else {
      throw error;
    }
  } finally {
    await client.end();
  }
};

// Create database
const createDatabase = async (dbName: string): Promise<void> => {
  const client = getAdminClient();
  try {
    await client.connect();
    logger.info(`Creating database ${dbName}...`);
    await client.query(`CREATE DATABASE ${dbName}`);
    logger.info(`Database ${dbName} created successfully`);
  } catch (error: any) {
    // Ignore error if database already exists
    if (error.code === '42P04') {
      logger.info(`Database ${dbName} already exists`);
    } else {
      throw error;
    }
  } finally {
    await client.end();
  }
};

// Reset database (drop and create)
export const resetDatabase = async (): Promise<void> => {
  try {
    const dbName = dbConfig.database;
    logger.info(`Resetting database ${dbName}...`);
    
    await dropDatabase(dbName);
    await createDatabase(dbName);
    
    logger.info('Database reset completed successfully!');
    logger.info('You can now run migrations with: npm run migrate:up');
  } catch (error: any) {
    logger.error('Reset database error:', { error: error.message, stack: error.stack });
    process.exit(1);
  }
};

// Run if called directly
if (require.main === module) {
  resetDatabase();
}
