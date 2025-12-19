import { Pool } from 'pg';
import { Migration } from './types';

export const migration: Migration = {
  async up(pool: Pool) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS product_variants (
        id SERIAL PRIMARY KEY,
        product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
        -- SKU riêng cho từng biến thể (ví dụ: AO-THUN-001-M-DO)
        sku VARCHAR(100) UNIQUE,
        variant_type VARCHAR(50) NOT NULL,
        variant_value VARCHAR(100) NOT NULL,
        -- Điều chỉnh giá theo đơn vị VND, dùng INTEGER để đồng bộ với products.price
        price_adjustment INTEGER DEFAULT 0,
        stock_quantity INTEGER DEFAULT 0,
        -- Ảnh riêng cho biến thể (ví dụ: màu khác nhau có ảnh khác nhau)
        image_url VARCHAR(500),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        -- Soft delete
        deleted_at TIMESTAMP,
        -- Đảm bảo không trùng (product_id, variant_type, variant_value)
        CONSTRAINT unique_product_variant UNIQUE (product_id, variant_type, variant_value)
      )
    `);

    // Indexes
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_product_variants_product ON product_variants(product_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_product_variants_sku ON product_variants(sku) WHERE sku IS NOT NULL
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_product_variants_type ON product_variants(variant_type)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_product_variants_active ON product_variants(is_active, deleted_at)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_product_variants_product_active ON product_variants(product_id, is_active) WHERE deleted_at IS NULL
    `);
  },

  async down(pool: Pool) {
    await pool.query('DROP INDEX IF EXISTS idx_product_variants_product_active');
    await pool.query('DROP INDEX IF EXISTS idx_product_variants_active');
    await pool.query('DROP INDEX IF EXISTS idx_product_variants_type');
    await pool.query('DROP INDEX IF EXISTS idx_product_variants_sku');
    await pool.query('DROP INDEX IF EXISTS idx_product_variants_product');
    await pool.query('DROP TABLE IF EXISTS product_variants CASCADE');
  },
};

