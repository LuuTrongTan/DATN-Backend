import { Pool } from 'pg';
import { Migration } from './types';

export const migration: Migration = {
  async up(pool: Pool) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS coupon_usage (
        id SERIAL PRIMARY KEY,
        coupon_id INTEGER REFERENCES coupons(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
        discount_amount DECIMAL(10, 2) NOT NULL,
        used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(coupon_id, user_id, order_id)
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_coupon_usage_coupon ON coupon_usage(coupon_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_coupon_usage_user ON coupon_usage(user_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_coupon_usage_order ON coupon_usage(order_id)
    `);
  },

  async down(pool: Pool) {
    await pool.query('DROP INDEX IF EXISTS idx_coupon_usage_order');
    await pool.query('DROP INDEX IF EXISTS idx_coupon_usage_user');
    await pool.query('DROP INDEX IF EXISTS idx_coupon_usage_coupon');
    await pool.query('DROP TABLE IF EXISTS coupon_usage CASCADE');
  },
};

