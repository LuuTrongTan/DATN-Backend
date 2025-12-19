import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import { Migration } from './types';

export const migration: Migration = {
  async up(pool: Pool) {
    // Enable UUID extension
    await pool.query(`
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    `);

    // Create enum type for user status
    await pool.query(`
      DO $$ BEGIN
        CREATE TYPE user_status AS ENUM ('active', 'banned', 'deleted');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        -- Phone: REQUIRED khi đăng ký (đăng ký chỉ qua phone)
        phone VARCHAR(15) UNIQUE NOT NULL,
        -- Email: OPTIONAL, user thêm sau khi đã có account
        email VARCHAR(255) UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        full_name VARCHAR(255),
        avatar_url VARCHAR(500),
        -- Xác thực riêng biệt
        -- phone_verified: TRUE sau khi verify OTP đăng ký thành công
        phone_verified BOOLEAN DEFAULT FALSE,
        -- email_verified: TRUE sau khi user thêm email và verify thành công
        email_verified BOOLEAN DEFAULT FALSE,
        -- Trạng thái (gộp is_active, is_banned, deleted_at)
        status user_status DEFAULT 'active',
        role VARCHAR(20) DEFAULT 'customer',
        -- Thông tin cá nhân
        date_of_birth DATE,
        gender VARCHAR(10), -- 'male', 'female', 'other'
        -- Hoạt động
        last_login_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Indexes for frequently queried fields
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_users_status ON users(status)
    `);

    // Composite indexes for common query patterns
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_users_role_status ON users(role, status)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_users_active_status ON users(status) WHERE status = 'active'
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_users_last_login ON users(last_login_at DESC)
    `);

    // Create default admin user
    const existingAdmin = await pool.query(
      "SELECT id FROM users WHERE phone = '0000000000' OR role = 'admin' LIMIT 1"
    );

    if (existingAdmin.rows.length === 0) {
      const defaultPassword = '12345678';
      const passwordHash = await bcrypt.hash(defaultPassword, 10);

      await pool.query(
        `INSERT INTO users (phone, email, password_hash, full_name, role, email_verified, phone_verified, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          '0000000000', // Phone mặc định cho admin (cần đổi sau)
          'admin@xgame.com',
          passwordHash,
          'Administrator',
          'admin',
          true,
          true, // Admin phone verified mặc định
          'active',
        ]
      );

      console.log('Default admin user created successfully!');
      console.log('Phone: 0000000000 (⚠️ Please change this!)');
      console.log('Email: admin@xgame.com');
      console.log('Password: 12345678');
      console.log('⚠️  Please change the password and phone after first login!');
    }
  },

  async down(pool: Pool) {
    await pool.query('DROP INDEX IF EXISTS idx_users_last_login');
    await pool.query('DROP INDEX IF EXISTS idx_users_active_status');
    await pool.query('DROP INDEX IF EXISTS idx_users_role_status');
    await pool.query('DROP INDEX IF EXISTS idx_users_status');
    await pool.query('DROP INDEX IF EXISTS idx_users_role');
    await pool.query('DROP INDEX IF EXISTS idx_users_phone');
    await pool.query('DROP INDEX IF EXISTS idx_users_email');
    await pool.query('DROP TABLE IF EXISTS users CASCADE');
    await pool.query('DROP TYPE IF EXISTS user_status CASCADE');
  },
};

