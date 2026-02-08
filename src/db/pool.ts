import pg from 'pg';
import { config } from '../config.js';

export const pool = new pg.Pool(config.database);

pool.on('error', (err) => {
  console.error('Unexpected database pool error:', err);
});
