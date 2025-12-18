import { Pool } from 'pg';
import { Migration } from './types';

export const migration: Migration = {
  async up(pool: Pool) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        order_number VARCHAR(50) UNIQUE NOT NULL,
        -- Thông tin khách hàng (backup khi user bị xóa)
        customer_name VARCHAR(255),
        customer_phone VARCHAR(10),
        customer_email VARCHAR(255),
        -- Tính toán giá
        subtotal DECIMAL(10, 2) NOT NULL,
        discount_amount DECIMAL(10, 2) DEFAULT 0,
        tax_amount DECIMAL(10, 2) DEFAULT 0,
        shipping_fee DECIMAL(10, 2) DEFAULT 0,
        total_amount DECIMAL(10, 2) NOT NULL,
        -- Thông tin đơn hàng
        shipping_address TEXT NOT NULL,
        payment_method VARCHAR(50) NOT NULL,
        payment_status VARCHAR(20) DEFAULT 'pending',
        order_status VARCHAR(20) DEFAULT 'pending',
        -- Hủy đơn hàng
        cancelled_at TIMESTAMP,
        cancelled_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        cancellation_reason TEXT,
        -- Giao hàng
        delivery_date DATE,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        -- Soft delete
        deleted_at TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(order_status)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number)
    `);
  },

  async down(pool: Pool) {
    await pool.query('DROP INDEX IF EXISTS idx_orders_status');
    await pool.query('DROP INDEX IF EXISTS idx_orders_user');
    await pool.query('DROP TABLE IF EXISTS orders CASCADE');
  },
};

