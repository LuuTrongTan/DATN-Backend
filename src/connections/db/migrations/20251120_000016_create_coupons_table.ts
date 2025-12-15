import { Pool } from 'pg';
import { Migration } from './types';

export const migration: Migration = {
  async up(pool: Pool) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS coupons (
        id SERIAL PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        discount_type VARCHAR(20) NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
        discount_value DECIMAL(10, 2) NOT NULL,
        min_order_amount DECIMAL(10, 2) DEFAULT 0,
        max_discount_amount DECIMAL(10, 2),
        usage_limit INTEGER,
        used_count INTEGER DEFAULT 0,
        user_limit INTEGER DEFAULT 1,
        start_date TIMESTAMP NOT NULL,
        end_date TIMESTAMP NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        applicable_to VARCHAR(20) DEFAULT 'all' CHECK (applicable_to IN ('all', 'category', 'product')),
        category_id INTEGER REFERENCES categories(id),
        product_id INTEGER REFERENCES products(id),
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_coupons_active ON coupons(is_active, start_date, end_date)
    `);
  },

  async down(pool: Pool) {
    await pool.query('DROP INDEX IF EXISTS idx_coupons_active');
    await pool.query('DROP INDEX IF EXISTS idx_coupons_code');
    await pool.query('DROP TABLE IF EXISTS coupons CASCADE');
  },
};


