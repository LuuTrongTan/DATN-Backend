import { Pool } from 'pg';
import { Migration } from './types';

export const migration: Migration = {
  async up(pool: Pool) {
    // Create enum type for notification type
    await pool.query(`
      DO $$ BEGIN
        CREATE TYPE notification_type AS ENUM (
          'order_placed',      -- Đơn hàng đã được đặt
          'order_shipped',     -- Đơn hàng đã được gửi
          'order_delivered',   -- Đơn hàng đã được giao
          'order_cancelled',   -- Đơn hàng bị hủy
          'payment_success',   -- Thanh toán thành công
          'payment_failed'     -- Thanh toán thất bại
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        type notification_type NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        link VARCHAR(500),
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read)
    `);
  },

  async down(pool: Pool) {
    await pool.query('DROP INDEX IF EXISTS idx_notifications_is_read');
    await pool.query('DROP INDEX IF EXISTS idx_notifications_type');
    await pool.query('DROP INDEX IF EXISTS idx_notifications_user');
    await pool.query('DROP TABLE IF EXISTS notifications CASCADE');
    await pool.query('DROP TYPE IF EXISTS notification_type CASCADE');
  },
};


