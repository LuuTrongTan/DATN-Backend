import { Pool } from 'pg';
import { Migration } from './types';

export const migration: Migration = {
  async up(pool: Pool) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS product_media (
        id SERIAL PRIMARY KEY,
        product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
        variant_id INTEGER REFERENCES product_variants(id) ON DELETE CASCADE,
        type VARCHAR(20) NOT NULL DEFAULT 'image',
        image_url VARCHAR(500) NOT NULL,
        alt_text VARCHAR(255),
        display_order INTEGER DEFAULT 0,
        is_primary BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_product_media_product ON product_media(product_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_product_media_variant ON product_media(variant_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_product_media_primary ON product_media(product_id, is_primary)
    `);
  },

  async down(pool: Pool) {
    await pool.query('DROP INDEX IF EXISTS idx_product_media_variant');
    await pool.query('DROP INDEX IF EXISTS idx_product_media_primary');
    await pool.query('DROP INDEX IF EXISTS idx_product_media_product');
    await pool.query('DROP TABLE IF EXISTS product_media CASCADE');
  },
};



