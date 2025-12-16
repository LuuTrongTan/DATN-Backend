import { Pool } from 'pg';
import { Migration } from './types';

export const migration: Migration = {
  async up(pool: Pool) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        category_id INTEGER REFERENCES categories(id),
        name VARCHAR(255) NOT NULL,
        description TEXT,
        -- Sử dụng INTEGER để lưu số tiền theo đơn vị VND, tránh DECIMAL trả về dạng string
        price INTEGER NOT NULL,
        stock_quantity INTEGER DEFAULT 0,
        image_urls TEXT[],
        video_url VARCHAR(500),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id)
    `);
  },

  async down(pool: Pool) {
    await pool.query('DROP INDEX IF EXISTS idx_products_category');
    await pool.query('DROP TABLE IF EXISTS products CASCADE');
  },
};

