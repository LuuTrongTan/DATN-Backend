import { Pool } from 'pg';
import { Migration } from './types';

export const migration: Migration = {
  async up(pool: Pool) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS stock_history (
        id SERIAL PRIMARY KEY,
        product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
        variant_id INTEGER REFERENCES product_variants(id) ON DELETE CASCADE,
        type VARCHAR(20) NOT NULL CHECK (type IN ('in', 'out', 'adjustment')),
        quantity INTEGER NOT NULL,
        previous_stock INTEGER NOT NULL,
        new_stock INTEGER NOT NULL,
        reason TEXT,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_stock_history_product ON stock_history(product_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_stock_history_variant ON stock_history(variant_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_stock_history_created_at ON stock_history(created_at DESC)
    `);
  },

  async down(pool: Pool) {
    await pool.query('DROP INDEX IF EXISTS idx_stock_history_created_at');
    await pool.query('DROP INDEX IF EXISTS idx_stock_history_variant');
    await pool.query('DROP INDEX IF EXISTS idx_stock_history_product');
    await pool.query('DROP TABLE IF EXISTS stock_history CASCADE');
  },
};


