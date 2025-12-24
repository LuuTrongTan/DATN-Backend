import { Pool } from 'pg';
import { Migration } from './types';

export const migration: Migration = {
  async up(pool: Pool) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_addresses (
        id SERIAL PRIMARY KEY,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        full_name VARCHAR(255) NOT NULL,
        phone VARCHAR(10) NOT NULL,
        province VARCHAR(100) NOT NULL,
        district VARCHAR(100) NOT NULL,
        ward VARCHAR(100) NOT NULL,
        street_address TEXT NOT NULL,
        is_default BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        -- Soft delete
        deleted_at TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_user_addresses_user ON user_addresses(user_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_user_addresses_default ON user_addresses(user_id, is_default)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_user_addresses_deleted_at ON user_addresses(deleted_at)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_user_addresses_user_not_deleted ON user_addresses(user_id, deleted_at)
    `);
  },

  async down(pool: Pool) {
    await pool.query('DROP INDEX IF EXISTS idx_user_addresses_user_not_deleted');
    await pool.query('DROP INDEX IF EXISTS idx_user_addresses_deleted_at');
    await pool.query('DROP INDEX IF EXISTS idx_user_addresses_default');
    await pool.query('DROP INDEX IF EXISTS idx_user_addresses_user');
    await pool.query('DROP TABLE IF EXISTS user_addresses CASCADE');
  },
};


