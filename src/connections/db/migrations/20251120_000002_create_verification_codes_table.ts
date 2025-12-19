import { Pool } from 'pg';
import { Migration } from './types';

export const migration: Migration = {
  async up(pool: Pool) {
    // Create enum type for verification code type
    await pool.query(`
      DO $$ BEGIN
        CREATE TYPE verification_code_type AS ENUM (
          'phone',           -- Đăng ký tài khoản qua số điện thoại (chưa có user_id)
          'verify_email',    -- Xác thực email sau khi user thêm email (có user_id)
          'change_phone',    -- Xác nhận đổi số điện thoại (có user_id)
          'password_reset',  -- Reset mật khẩu (có user_id)
          '2fa'              -- Xác thực 2 yếu tố (có user_id)
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS verification_codes (
        id SERIAL PRIMARY KEY,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        -- Gộp phone và email thành 1 cột
        -- - type='phone' hoặc 'change_phone': lưu số điện thoại
        -- - type='verify_email' hoặc 'password_reset': lưu email
        -- - type='2fa': có thể là phone hoặc email
        contact_value VARCHAR(255) NOT NULL,
        code VARCHAR(10) NOT NULL,
        type verification_code_type NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        is_used BOOLEAN DEFAULT FALSE,
        attempts INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        -- Ràng buộc:
        -- 1. Đăng ký mới (type='phone'): không có user_id, contact_value là phone
        -- 2. Các trường hợp khác: phải có user_id, contact_value là phone hoặc email tùy type
        CONSTRAINT chk_verification_identifier CHECK (
          (type = 'phone' AND user_id IS NULL) OR
          (type != 'phone' AND user_id IS NOT NULL)
        )
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_verification_codes_user ON verification_codes(user_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_verification_codes_contact ON verification_codes(contact_value)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_verification_codes_code ON verification_codes(code)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_verification_codes_type_expires ON verification_codes(type, expires_at)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_verification_codes_contact_type ON verification_codes(contact_value, type)
    `);
  },

  async down(pool: Pool) {
    await pool.query('DROP INDEX IF EXISTS idx_verification_codes_contact_type');
    await pool.query('DROP INDEX IF EXISTS idx_verification_codes_type_expires');
    await pool.query('DROP INDEX IF EXISTS idx_verification_codes_code');
    await pool.query('DROP INDEX IF EXISTS idx_verification_codes_contact');
    await pool.query('DROP INDEX IF EXISTS idx_verification_codes_user');
    await pool.query('DROP TABLE IF EXISTS verification_codes CASCADE');
    await pool.query('DROP TYPE IF EXISTS verification_code_type CASCADE');
  },
};

