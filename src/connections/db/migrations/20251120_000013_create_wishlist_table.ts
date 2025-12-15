import { Pool } from 'pg';
import { Migration } from './types';

export const migration: Migration = {
  async up(pool: Pool) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS wishlist (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, product_id)
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_wishlist_user ON wishlist(user_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_wishlist_product ON wishlist(product_id)
    `);
  },

  async down(pool: Pool) {
    await pool.query('DROP INDEX IF EXISTS idx_wishlist_product');
    await pool.query('DROP INDEX IF EXISTS idx_wishlist_user');
    await pool.query('DROP TABLE IF EXISTS wishlist CASCADE');
  },
};


