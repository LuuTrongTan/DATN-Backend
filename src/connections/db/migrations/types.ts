import { Pool } from 'pg';

export interface Migration {
  up(pool: Pool): Promise<void>;
  down(pool: Pool): Promise<void>;
}

export interface MigrationInfo {
  name: string;
  migration: Migration;
}

