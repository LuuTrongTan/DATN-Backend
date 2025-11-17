import { pool } from './connection';
import { migrations } from './migrations';

// Create migrations table if not exists
const createMigrationsTable = async () => {
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
    console.log(`✓ Migration ${name} executed successfully`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`✗ Migration ${name} failed:`, error);
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
    console.log(`✓ Migration ${name} rolled back successfully`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`✗ Migration ${name} rollback failed:`, error);
    throw error;
  } finally {
    client.release();
  }
};

// Run all pending migrations
export const migrate = async () => {
  try {
    console.log('Starting database migrations...');
    
    // Create migrations table
    await createMigrationsTable();
    
    console.log(`Found ${migrations.length} migration files`);
    
    for (const { name, migration } of migrations) {
      // Skip if already executed
      if (await isMigrationExecuted(name)) {
        console.log(`⊘ Migration ${name} already executed, skipping...`);
        continue;
      }
      
      // Execute migration
      await runMigration(name, migration);
    }
    
    console.log('All migrations completed successfully!');
  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
};

// Rollback last migration
export const rollback = async () => {
  try {
    console.log('Rolling back last migration...');
    
    await createMigrationsTable();
    
    // Get last executed migration
    const result = await pool.query(
      'SELECT name FROM migrations ORDER BY executed_at DESC LIMIT 1'
    );
    
    if (result.rows.length === 0) {
      console.log('No migrations to rollback');
      return;
    }
    
    const lastMigrationName = result.rows[0].name;
    const migrationInfo = migrations.find(m => m.name === lastMigrationName);
    
    if (!migrationInfo) {
      console.error(`Migration ${lastMigrationName} not found in migrations list`);
      return;
    }
    
    await rollbackMigration(lastMigrationName, migrationInfo.migration);
    console.log('Rollback completed successfully!');
  } catch (error) {
    console.error('Rollback error:', error);
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
  } else {
    migrate();
  }
}
