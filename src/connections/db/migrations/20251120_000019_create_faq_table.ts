import { Pool } from 'pg';
import { Migration } from './types';

export const migration: Migration = {
  async up(pool: Pool) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS faqs (
        id SERIAL PRIMARY KEY,
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        category VARCHAR(50),
        order_index INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT TRUE,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_faqs_category ON faqs(category)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_faqs_active ON faqs(is_active, order_index)
    `);
  },

  async down(pool: Pool) {
    await pool.query('DROP INDEX IF EXISTS idx_faqs_active');
    await pool.query('DROP INDEX IF EXISTS idx_faqs_category');
    await pool.query('DROP TABLE IF EXISTS faqs CASCADE');
  },
};


