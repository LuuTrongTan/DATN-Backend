import { Pool } from 'pg';
import { Migration } from './types';

export const migration: Migration = {
  async up(pool: Pool) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS product_tags (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) UNIQUE NOT NULL,
        slug VARCHAR(100) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS product_tag_relations (
        product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
        tag_id INTEGER REFERENCES product_tags(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (product_id, tag_id)
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_product_tag_relations_product ON product_tag_relations(product_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_product_tag_relations_tag ON product_tag_relations(tag_id)
    `);
  },

  async down(pool: Pool) {
    await pool.query('DROP INDEX IF EXISTS idx_product_tag_relations_tag');
    await pool.query('DROP INDEX IF EXISTS idx_product_tag_relations_product');
    await pool.query('DROP TABLE IF EXISTS product_tag_relations CASCADE');
    await pool.query('DROP TABLE IF EXISTS product_tags CASCADE');
  },
};


