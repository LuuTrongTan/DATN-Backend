import { Pool } from 'pg';
import { Migration } from './types';

export const migration: Migration = {
  async up(pool: Pool) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        category_id INTEGER REFERENCES categories(id),
        -- Thông tin cơ bản
        sku VARCHAR(100),
        name VARCHAR(255) NOT NULL,
        description TEXT,
        -- Giá cả
        price INTEGER NOT NULL,
        stock_quantity INTEGER DEFAULT 0,
        -- Thương hiệu
        brand VARCHAR(100),
        -- Thống kê
        view_count INTEGER DEFAULT 0,
        sold_count INTEGER DEFAULT 0,
        -- Trạng thái
        is_active BOOLEAN DEFAULT TRUE,
        -- Full-text search vector (cho PostgreSQL full-text search)
        search_vector tsvector,
        -- Vector embeddings (cho semantic search - cần pgvector extension)
        -- embedding vector(1536), -- OpenAI ada-002 dimension
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        -- Soft delete
        deleted_at TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_products_name ON products(name)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_products_price ON products(price)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_products_created_at ON products(created_at DESC)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active) WHERE is_active = TRUE
    `);

    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_products_sku ON products(sku) WHERE sku IS NOT NULL AND deleted_at IS NULL
    `);

    // Full-text search index (GIN index cho tsvector)
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_products_search_vector ON products USING GIN(search_vector)
    `);

    // Composite index cho search thường dùng
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_products_category_active ON products(category_id, is_active) WHERE is_active = TRUE
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_products_price_range ON products(price, category_id) WHERE is_active = TRUE
    `);
  },

  async down(pool: Pool) {
    await pool.query('DROP INDEX IF EXISTS idx_products_price_range');
    await pool.query('DROP INDEX IF EXISTS idx_products_category_active');
    await pool.query('DROP INDEX IF EXISTS idx_products_search_vector');
    await pool.query('DROP INDEX IF EXISTS idx_products_sku');
    await pool.query('DROP INDEX IF EXISTS idx_products_active');
    await pool.query('DROP INDEX IF EXISTS idx_products_created_at');
    await pool.query('DROP INDEX IF EXISTS idx_products_price');
    await pool.query('DROP INDEX IF EXISTS idx_products_name');
    await pool.query('DROP INDEX IF EXISTS idx_products_category');
    await pool.query('DROP TABLE IF EXISTS products CASCADE');
  },
};

