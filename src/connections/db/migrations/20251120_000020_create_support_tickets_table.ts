import { Pool } from 'pg';
import { Migration } from './types';

export const migration: Migration = {
  async up(pool: Pool) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS support_tickets (
        id SERIAL PRIMARY KEY,
        ticket_number VARCHAR(50) UNIQUE NOT NULL,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        subject VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
        priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
        assigned_to INTEGER REFERENCES users(id),
        order_id INTEGER REFERENCES orders(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON support_tickets(user_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_support_tickets_assigned ON support_tickets(assigned_to)
    `);
  },

  async down(pool: Pool) {
    await pool.query('DROP INDEX IF EXISTS idx_support_tickets_assigned');
    await pool.query('DROP INDEX IF EXISTS idx_support_tickets_status');
    await pool.query('DROP INDEX IF EXISTS idx_support_tickets_user');
    await pool.query('DROP TABLE IF EXISTS support_tickets CASCADE');
  },
};

