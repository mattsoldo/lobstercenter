import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { config } from '../config.js';
import * as schema from './schema.js';

const dbConfig = config.database;

// Neon/Vercel Postgres requires SSL
const needsSsl = 'connectionString' in dbConfig &&
  (dbConfig.connectionString.includes('neon.tech') || dbConfig.connectionString.includes('vercel'));

export const pool = new pg.Pool({
  ...dbConfig,
  ...(needsSsl ? { ssl: { rejectUnauthorized: false } } : {}),
});

pool.on('error', (err) => {
  console.error('Unexpected database pool error:', err);
});

export const db = drizzle(pool, { schema });
