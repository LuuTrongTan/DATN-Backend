import { Pool, QueryResult } from 'pg';
import { dbConfig } from '../config/database.config';

export const pool = new Pool(dbConfig);

pool.on('error', (err: Error) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

// Test connection
pool.query('SELECT NOW()')
  .then((res: QueryResult) => {
    console.log('Database connected successfully');
  })
  .catch((err: Error) => {
    console.error('Database connection error:', err);
  });

