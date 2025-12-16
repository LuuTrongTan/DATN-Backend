import { Pool } from 'pg';
import { Migration } from './types';

export const migration: Migration = {
  async up(pool: Pool) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS product_variants (
        id SERIAL PRIMARY KEY,
        product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
        variant_type VARCHAR(50) NOT NULL,
        variant_value VARCHAR(100) NOT NULL,
        -- Điều chỉnh giá theo đơn vị VND, dùng INTEGER để đồng bộ với products.price
        price_adjustment INTEGER DEFAULT 0,
        stock_quantity INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  },

  async down(pool: Pool) {
    await pool.query('DROP TABLE IF EXISTS product_variants CASCADE');
  },
};

