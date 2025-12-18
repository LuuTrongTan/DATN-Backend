import { Pool } from 'pg';
import { Migration } from './types';

export const migration: Migration = {
  async up(pool: Pool) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reviews (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        product_id INTEGER REFERENCES products(id),
        order_id INTEGER REFERENCES orders(id),
        rating INTEGER CHECK (rating >= 1 AND rating <= 5),
        comment TEXT,
        image_urls TEXT[],
        video_url VARCHAR(500),
        -- Phản hồi từ shop
        reply TEXT,
        replied_at TIMESTAMP,
        replied_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        -- Tương tác
        helpful_count INTEGER DEFAULT 0,
        is_approved BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, product_id, order_id)
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_reviews_rating ON reviews(rating)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_reviews_created_at ON reviews(created_at DESC)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_reviews_product_rating ON reviews(product_id, rating)
    `);
  },

  async down(pool: Pool) {
    await pool.query('DROP INDEX IF EXISTS idx_reviews_product');
    await pool.query('DROP TABLE IF EXISTS reviews CASCADE');
  },
};

