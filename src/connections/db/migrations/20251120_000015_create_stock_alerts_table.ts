import { Pool } from 'pg';
import { Migration } from './types';

export const migration: Migration = {
  async up(pool: Pool) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS stock_alerts (
        id SERIAL PRIMARY KEY,
        product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
        variant_id INTEGER REFERENCES product_variants(id) ON DELETE CASCADE,
        threshold INTEGER NOT NULL DEFAULT 10,
        current_stock INTEGER NOT NULL,
        is_notified BOOLEAN DEFAULT FALSE,
        notified_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_stock_alerts_product ON stock_alerts(product_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_stock_alerts_variant ON stock_alerts(variant_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_stock_alerts_notified ON stock_alerts(is_notified)
    `);
  },

  async down(pool: Pool) {
    await pool.query('DROP INDEX IF EXISTS idx_stock_alerts_notified');
    await pool.query('DROP INDEX IF EXISTS idx_stock_alerts_variant');
    await pool.query('DROP INDEX IF EXISTS idx_stock_alerts_product');
    await pool.query('DROP TABLE IF EXISTS stock_alerts CASCADE');
  },
};


