import { Pool } from 'pg';
import { Migration } from './types';

export const migration: Migration = {
  async up(pool: Pool) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payment_transactions (
        id SERIAL PRIMARY KEY,
        order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
        transaction_id VARCHAR(100) UNIQUE,
        payment_gateway VARCHAR(50) NOT NULL, -- 'vnpay', 'momo', etc.
        amount DECIMAL(10, 2) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'success', 'failed', 'cancelled'
        response_data JSONB, -- Lưu response từ payment gateway
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_payment_transactions_order ON payment_transactions(order_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_payment_transactions_transaction_id ON payment_transactions(transaction_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_payment_transactions_status ON payment_transactions(status)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_payment_transactions_gateway ON payment_transactions(payment_gateway)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_payment_transactions_created_at ON payment_transactions(created_at DESC)
    `);
  },

  async down(pool: Pool) {
    await pool.query('DROP INDEX IF EXISTS idx_payment_transactions_created_at');
    await pool.query('DROP INDEX IF EXISTS idx_payment_transactions_gateway');
    await pool.query('DROP INDEX IF EXISTS idx_payment_transactions_status');
    await pool.query('DROP INDEX IF EXISTS idx_payment_transactions_transaction_id');
    await pool.query('DROP INDEX IF EXISTS idx_payment_transactions_order');
    await pool.query('DROP TABLE IF EXISTS payment_transactions CASCADE');
  },
};



