import { Pool } from 'pg';
import { Migration } from './types';

export const migration: Migration = {
  async up(pool: Pool) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS refund_items (
        id SERIAL PRIMARY KEY,
        refund_id INTEGER REFERENCES refunds(id) ON DELETE CASCADE,
        order_item_id INTEGER REFERENCES order_items(id) ON DELETE CASCADE,
        quantity INTEGER NOT NULL,
        refund_amount DECIMAL(10, 2) NOT NULL,
        reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_refund_items_refund ON refund_items(refund_id)
    `);
  },

  async down(pool: Pool) {
    await pool.query('DROP INDEX IF EXISTS idx_refund_items_refund');
    await pool.query('DROP TABLE IF EXISTS refund_items CASCADE');
  },
};


