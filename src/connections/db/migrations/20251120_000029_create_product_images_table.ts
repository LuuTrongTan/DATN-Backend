import { Pool } from 'pg';
import { Migration } from './types';

export const migration: Migration = {
  async up(pool: Pool) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS product_images (
        id SERIAL PRIMARY KEY,
        product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
        image_url VARCHAR(500) NOT NULL,
        alt_text VARCHAR(255),
        display_order INTEGER DEFAULT 0,
        is_primary BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_product_images_product ON product_images(product_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_product_images_primary ON product_images(product_id, is_primary)
    `);
  },

  async down(pool: Pool) {
    await pool.query('DROP INDEX IF EXISTS idx_product_images_primary');
    await pool.query('DROP INDEX IF EXISTS idx_product_images_product');
    await pool.query('DROP TABLE IF EXISTS product_images CASCADE');
  },
};



