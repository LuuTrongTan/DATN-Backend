import { Pool } from 'pg';
import { Migration } from './types';

export const migration: Migration = {
  async up(pool: Pool) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        action VARCHAR(100) NOT NULL,
        table_name VARCHAR(100) NOT NULL,
        record_id INTEGER,
        -- Dữ liệu đã được lọc/mask các trường nhạy cảm (password, credit_card, v.v.)
        old_data JSONB,
        new_data JSONB,
        -- Metadata bổ sung
        severity VARCHAR(20) DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        -- Retention: tự động xóa sau 2 năm (có thể điều chỉnh)
        expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '2 years')
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_table_record ON audit_logs(table_name, record_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_expires_at ON audit_logs(expires_at)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_severity ON audit_logs(severity)
    `);
  },

  async down(pool: Pool) {
    await pool.query('DROP INDEX IF EXISTS idx_audit_logs_severity');
    await pool.query('DROP INDEX IF EXISTS idx_audit_logs_expires_at');
    await pool.query('DROP INDEX IF EXISTS idx_audit_logs_created_at');
    await pool.query('DROP INDEX IF EXISTS idx_audit_logs_user');
    await pool.query('DROP INDEX IF EXISTS idx_audit_logs_table_record');
    await pool.query('DROP TABLE IF EXISTS audit_logs CASCADE');
  },
};



