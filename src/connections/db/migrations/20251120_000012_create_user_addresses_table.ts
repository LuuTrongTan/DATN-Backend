import { Pool } from 'pg';
import { Migration } from './types';

export const migration: Migration = {
  async up(pool: Pool) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_addresses (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        full_name VARCHAR(255) NOT NULL,
        phone VARCHAR(11) NOT NULL,
        province VARCHAR(100) NOT NULL,
        district VARCHAR(100) NOT NULL,
        ward VARCHAR(100) NOT NULL,
        street_address TEXT NOT NULL,
        is_default BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_user_addresses_user ON user_addresses(user_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_user_addresses_default ON user_addresses(user_id, is_default)
    `);
  },

  async down(pool: Pool) {
    await pool.query('DROP INDEX IF EXISTS idx_user_addresses_default');
    await pool.query('DROP INDEX IF EXISTS idx_user_addresses_user');
    await pool.query('DROP TABLE IF EXISTS user_addresses CASCADE');
  },
};


