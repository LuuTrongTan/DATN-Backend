import { Pool } from 'pg';
import { Migration } from './types';

export const migration: Migration = {
  async up(pool: Pool) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS verification_codes (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        code VARCHAR(10) NOT NULL,
        type VARCHAR(20) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        is_used BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_verification_codes_user ON verification_codes(user_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_verification_codes_code ON verification_codes(code)
    `);
  },

  async down(pool: Pool) {
    await pool.query('DROP INDEX IF EXISTS idx_verification_codes_code');
    await pool.query('DROP INDEX IF EXISTS idx_verification_codes_user');
    await pool.query('DROP TABLE IF EXISTS verification_codes CASCADE');
  },
};

