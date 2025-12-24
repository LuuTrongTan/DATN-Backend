import { Pool } from 'pg';
import { Migration } from './types';

export const migration: Migration = {
  async up(pool: Pool) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS shipping (
        id SERIAL PRIMARY KEY,
        order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
        shipping_provider VARCHAR(50),
        tracking_number VARCHAR(100),
        shipping_fee DECIMAL(10, 2) NOT NULL,
        estimated_delivery_date TIMESTAMP,
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'picked_up', 'in_transit', 'delivered', 'failed', 'returned')),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_shipping_order ON shipping(order_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_shipping_tracking ON shipping(tracking_number)
    `);
  },

  async down(pool: Pool) {
    await pool.query('DROP INDEX IF EXISTS idx_shipping_tracking');
    await pool.query('DROP INDEX IF EXISTS idx_shipping_order');
    await pool.query('DROP TABLE IF EXISTS shipping CASCADE');
  },
};



