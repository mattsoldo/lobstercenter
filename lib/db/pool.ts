import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { config } from '../config';
import * as schema from './schema';

const dbConfig = config.database;

// Neon/Vercel Postgres requires SSL
const needsSsl = 'connectionString' in dbConfig &&
  (dbConfig.connectionString.includes('neon.tech') || dbConfig.connectionString.includes('vercel'));

// Cache pool on globalThis to prevent exhaustion during Next.js dev hot reloads
const globalForDb = globalThis as unknown as { pool: pg.Pool | undefined };

export const pool = globalForDb.pool ?? new pg.Pool({
  ...dbConfig,
  ...(needsSsl ? { ssl: { rejectUnauthorized: false } } : {}),
});

if (process.env.NODE_ENV !== 'production') {
  globalForDb.pool = pool;
}

pool.on('error', (err) => {
  console.error('Unexpected database pool error:', err);
});

export const db = drizzle(pool, { schema });
