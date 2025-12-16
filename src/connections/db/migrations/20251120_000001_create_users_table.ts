import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import { Migration } from './types';

export const migration: Migration = {
  async up(pool: Pool) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE,
        phone VARCHAR(10) UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        full_name VARCHAR(255),
        is_verified BOOLEAN DEFAULT FALSE,
        is_active BOOLEAN DEFAULT TRUE,
        is_banned BOOLEAN DEFAULT FALSE,
        role VARCHAR(20) DEFAULT 'customer',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone)
    `);

    // Create default admin user
    const existingAdmin = await pool.query(
      "SELECT id FROM users WHERE email = 'admin@xgame.com' OR role = 'admin' LIMIT 1"
    );

    if (existingAdmin.rows.length === 0) {
      const defaultPassword = '12345678';
      const passwordHash = await bcrypt.hash(defaultPassword, 10);

      await pool.query(
        `INSERT INTO users (email, password_hash, full_name, role, is_verified, is_active)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          'admin@xgame.com',
          passwordHash,
          'Administrator',
          'admin',
          true,
          true,
        ]
      );

      console.log('Default admin user created successfully!');
      console.log('Email: admin@xgame.com');
      console.log('Password: 12345678');
      console.log('⚠️  Please change the password after first login!');
    }
  },

  async down(pool: Pool) {
    await pool.query('DROP INDEX IF EXISTS idx_users_phone');
    await pool.query('DROP INDEX IF EXISTS idx_users_email');
    await pool.query('DROP TABLE IF EXISTS users CASCADE');
  },
};

