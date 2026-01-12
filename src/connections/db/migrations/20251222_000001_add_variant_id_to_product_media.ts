import { Pool } from 'pg';
import { Migration } from './types';

/**
 * Bổ sung cột variant_id và index cho product_media (idempotent).
 * Dùng khi môi trường chưa có cột này hoặc cần re-run an toàn.
 */
export const migration: Migration = {
  async up(pool: Pool) {
    await pool.query(`
      ALTER TABLE product_media
      ADD COLUMN IF NOT EXISTS variant_id INTEGER REFERENCES product_variants(id) ON DELETE CASCADE
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_product_media_variant ON product_media(variant_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_product_media_product_variant ON product_media(product_id, variant_id)
    `);
  },

  async down(pool: Pool) {
    await pool.query('DROP INDEX IF EXISTS idx_product_media_product_variant');
    await pool.query('DROP INDEX IF EXISTS idx_product_media_variant');
    await pool.query('ALTER TABLE product_media DROP COLUMN IF EXISTS variant_id');
  },
};
