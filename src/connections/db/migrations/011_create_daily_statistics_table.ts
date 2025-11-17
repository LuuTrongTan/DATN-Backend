import { Pool } from 'pg';
import { Migration } from './types';

export const migration: Migration = {
  async up(pool: Pool) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS daily_statistics (
        id SERIAL PRIMARY KEY,
        date DATE UNIQUE NOT NULL,
        total_orders INTEGER DEFAULT 0,
        total_revenue DECIMAL(10, 2) DEFAULT 0,
        total_users INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  },

  async down(pool: Pool) {
    await pool.query('DROP TABLE IF EXISTS daily_statistics CASCADE');
  },
};

