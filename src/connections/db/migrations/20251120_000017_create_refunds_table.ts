import { Pool } from 'pg';
import { Migration } from './types';

export const migration: Migration = {
  async up(pool: Pool) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS refunds (
        id SERIAL PRIMARY KEY,
        refund_number VARCHAR(50) UNIQUE NOT NULL,
        order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        type VARCHAR(20) NOT NULL CHECK (type IN ('refund', 'return', 'exchange')),
        reason TEXT NOT NULL,
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'processing', 'completed', 'cancelled')),
        refund_amount DECIMAL(10, 2),
        admin_notes TEXT,
        processed_by UUID REFERENCES users(id),
        processed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_refunds_order ON refunds(order_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_refunds_user ON refunds(user_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_refunds_status ON refunds(status)
    `);
  },

  async down(pool: Pool) {
    await pool.query('DROP INDEX IF EXISTS idx_refunds_status');
    await pool.query('DROP INDEX IF EXISTS idx_refunds_user');
    await pool.query('DROP INDEX IF EXISTS idx_refunds_order');
    await pool.query('DROP TABLE IF EXISTS refunds CASCADE');
  },
};



