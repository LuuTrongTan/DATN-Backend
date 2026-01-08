import { pool } from './connection';
import { migrations } from './migrations';
import { logger } from '../../utils/logging';

// Ensure public schema exists
const ensurePublicSchema = async () => {
  await pool.query(`CREATE SCHEMA IF NOT EXISTS public`);
  await pool.query(`SET search_path TO public`);
};

// Create migrations table if not exists
const createMigrationsTable = async () => {
  await ensurePublicSchema();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) UNIQUE NOT NULL,
      executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
};

// Check if migration has been executed
const isMigrationExecuted = async (name: string): Promise<boolean> => {
  const result = await pool.query(
    'SELECT id FROM migrations WHERE name = $1',
    [name]
  );
  return result.rows.length > 0;
};

// Mark migration as executed
const markMigrationExecuted = async (name: string) => {
  await pool.query(
    'INSERT INTO migrations (name) VALUES ($1)',
    [name]
  );
};

// Run migration
const runMigration = async (name: string, migration: any) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await migration.up(client);
    await markMigrationExecuted(name);
    await client.query('COMMIT');
    logger.info(`Migration ${name} executed successfully`);
  } catch (error: any) {
    await client.query('ROLLBACK');
    logger.error(`Migration ${name} failed:`, { error: error.message, stack: error.stack });
    throw error;
  } finally {
    client.release();
  }
};

// Rollback migration
const rollbackMigration = async (name: string, migration: any) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await migration.down(client);
    await pool.query('DELETE FROM migrations WHERE name = $1', [name]);
    await client.query('COMMIT');
    logger.info(`Migration ${name} rolled back successfully`);
  } catch (error: any) {
    await client.query('ROLLBACK');
    logger.error(`Migration ${name} rollback failed:`, { error: error.message, stack: error.stack });
    throw error;
  } finally {
    client.release();
  }
};

// Run all pending migrations
export const migrate = async () => {
  try {
    logger.info('Starting database migrations...');
    
    // Create migrations table
    await createMigrationsTable();
    
    logger.info(`Found ${migrations.length} migration files`);
    
    for (const { name, migration } of migrations) {
      // Skip if already executed
      if (await isMigrationExecuted(name)) {
        logger.info(`Migration ${name} already executed, skipping...`);
        continue;
      }
      
      // Execute migration
      await runMigration(name, migration);
    }
    
    logger.info('All migrations completed successfully!');
  } catch (error: any) {
    logger.error('Migration error:', { error: error.message, stack: error.stack });
    process.exit(1);
  } finally {
    await pool.end();
  }
};

// Rollback last migration
export const rollback = async () => {
  try {
    logger.info('Rolling back last migration...');
    
    await createMigrationsTable();
    
    // Get last executed migration
    const result = await pool.query(
      'SELECT name FROM migrations ORDER BY executed_at DESC LIMIT 1'
    );
    
    if (result.rows.length === 0) {
      logger.info('No migrations to rollback');
      return;
    }
    
    const lastMigrationName = result.rows[0].name;
    const migrationInfo = migrations.find(m => m.name === lastMigrationName);
    
    if (!migrationInfo) {
      logger.error(`Migration ${lastMigrationName} not found in migrations list`);
      return;
    }
    
    await rollbackMigration(lastMigrationName, migrationInfo.migration);
    logger.info('Rollback completed successfully!');
  } catch (error: any) {
    logger.error('Rollback error:', { error: error.message, stack: error.stack });
    process.exit(1);
  } finally {
    await pool.end();
  }
};

// Rollback all migrations
export const rollbackAll = async () => {
  try {
    logger.info('Rolling back all migrations...');
    
    await createMigrationsTable();
    
    // Get all executed migrations in reverse order (newest first)
    const result = await pool.query(
      'SELECT name FROM migrations ORDER BY executed_at DESC'
    );
    
    if (result.rows.length === 0) {
      logger.info('No migrations to rollback');
      return;
    }
    
    logger.info(`Found ${result.rows.length} migrations to rollback`);
    
    // Rollback each migration in reverse order
    for (const row of result.rows) {
      const migrationName = row.name;
      const migrationInfo = migrations.find(m => m.name === migrationName);
      
      if (!migrationInfo) {
        logger.warn(`Migration ${migrationName} not found in migrations list, skipping...`);
        continue;
      }
      
      logger.info(`Rolling back migration: ${migrationName}`);
      await rollbackMigration(migrationName, migrationInfo.migration);
    }
    
    logger.info('All migrations rolled back successfully!');
  } catch (error: any) {
    logger.error('Rollback all error:', { error: error.message, stack: error.stack });
    process.exit(1);
  } finally {
    await pool.end();
  }
};

// Reset migrations table (delete all migration records)
export const resetMigrations = async () => {
  try {
    logger.info('Resetting migrations table...');
    
    await createMigrationsTable();
    
    // Delete all migration records
    await pool.query('DELETE FROM migrations');
    
    logger.info('Migrations table reset successfully!');
    logger.info('You can now run migrations again with: npm run migrate:up');
  } catch (error: any) {
    logger.error('Reset migrations error:', { error: error.message, stack: error.stack });
    process.exit(1);
  } finally {
    await pool.end();
  }
};

// Run if called directly
if (require.main === module) {
  const command = process.argv[2];
  
  if (command === 'rollback') {
    rollback();
  } else if (command === 'rollback:all') {
    rollbackAll();
  } else if (command === 'reset') {
    resetMigrations();
  } else {
    migrate();
  }
}
