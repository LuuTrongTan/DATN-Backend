import { Pool } from 'pg';
import { Migration } from './types';

/**
 * Tạo bảng app_settings để lưu các cấu hình toàn hệ thống (feature flags).
 * 
 * Hiện tại sử dụng cho cấu hình:
 * - require_firebase_for_phone_registration: boolean
 */
export const migration: Migration = {
  async up(pool: Pool) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS app_settings (
        id SERIAL PRIMARY KEY,
        key TEXT NOT NULL UNIQUE,
        value JSONB NOT NULL,
        description TEXT,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      )
    `);

    // Trigger cập nhật updated_at
    await pool.query(`
      CREATE OR REPLACE FUNCTION set_app_settings_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_trigger
          WHERE tgname = 'trg_app_settings_updated_at'
        ) THEN
          CREATE TRIGGER trg_app_settings_updated_at
          BEFORE UPDATE ON app_settings
          FOR EACH ROW
          EXECUTE FUNCTION set_app_settings_updated_at();
        END IF;
      END;
      $$;
    `);

    // Seed config bật bắt buộc Firebase cho đăng ký bằng số điện thoại (mặc định: true để giữ hành vi cũ)
    await pool.query(
      `
        INSERT INTO app_settings (key, value, description)
        VALUES ($1, $2, $3)
        ON CONFLICT (key) DO NOTHING
      `,
      [
        'auth.require_firebase_for_phone_registration',
        JSON.stringify({ enabled: true }),
        'Bật/tắt bắt buộc xác thực Firebase khi đăng ký tài khoản bằng số điện thoại',
      ]
    );
  },

  async down(pool: Pool) {
    await pool.query(`DROP TRIGGER IF EXISTS trg_app_settings_updated_at ON app_settings`);
    await pool.query(`DROP FUNCTION IF EXISTS set_app_settings_updated_at()`);
    await pool.query(`DROP TABLE IF EXISTS app_settings`);
  },
};

