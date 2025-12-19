import { Pool } from 'pg';
import { Migration } from './types';

export const migration: Migration = {
  async up(pool: Pool) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        -- Danh mục cha (NULL = danh mục gốc)
        parent_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
        name VARCHAR(255) NOT NULL,
        -- Slug cho SEO-friendly URL
        slug VARCHAR(255) UNIQUE NOT NULL,
        image_url VARCHAR(500),
        description TEXT,
        -- Thứ tự hiển thị (số nhỏ hiển thị trước)
        display_order INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        -- Soft delete
        deleted_at TIMESTAMP
      )
    `);

    // Indexes
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_categories_active ON categories(is_active, deleted_at)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_categories_display_order ON categories(display_order, is_active) WHERE deleted_at IS NULL
    `);
  },

  async down(pool: Pool) {
    await pool.query('DROP INDEX IF EXISTS idx_categories_display_order');
    await pool.query('DROP INDEX IF EXISTS idx_categories_active');
    await pool.query('DROP INDEX IF EXISTS idx_categories_slug');
    await pool.query('DROP INDEX IF EXISTS idx_categories_parent');
    await pool.query('DROP TABLE IF EXISTS categories CASCADE');
  },
};

