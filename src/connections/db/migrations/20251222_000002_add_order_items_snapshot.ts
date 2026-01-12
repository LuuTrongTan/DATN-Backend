import { Pool } from 'pg';
import { Migration } from './types';

/**
 * Bổ sung các trường snapshot cho order_items và chuẩn hóa kiểu giá tiền.
 */
export const migration: Migration = {
  async up(pool: Pool) {
    // Giá tiền về decimal(10,2)
    await pool.query(`
      ALTER TABLE order_items
      ALTER COLUMN price TYPE DECIMAL(10,2)
      USING price::DECIMAL(10,2)
    `);

    // Snapshot tên/sku/thuộc tính
    await pool.query(`
      ALTER TABLE order_items
      ADD COLUMN IF NOT EXISTS product_name TEXT,
      ADD COLUMN IF NOT EXISTS product_sku VARCHAR(100),
      ADD COLUMN IF NOT EXISTS variant_sku VARCHAR(100),
      ADD COLUMN IF NOT EXISTS variant_attributes_snapshot JSONB
    `);

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_order_items_product_sku ON order_items(product_sku)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_order_items_variant_sku ON order_items(variant_sku)`);
  },

  async down(pool: Pool) {
    await pool.query('DROP INDEX IF EXISTS idx_order_items_product_sku');
    await pool.query('DROP INDEX IF EXISTS idx_order_items_variant_sku');
    await pool.query(`
      ALTER TABLE order_items
      DROP COLUMN IF EXISTS product_name,
      DROP COLUMN IF EXISTS product_sku,
      DROP COLUMN IF EXISTS variant_sku,
      DROP COLUMN IF EXISTS variant_attributes_snapshot
    `);
    await pool.query(`
      ALTER TABLE order_items
      ALTER COLUMN price TYPE INTEGER
      USING price::INTEGER
    `);
  },
};
