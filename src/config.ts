import 'dotenv/config';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

// Load .env.local if dotenv/config didn't pick it up
try {
  const dir = resolve(fileURLToPath(import.meta.url), '..', '..');
  const envLocal = resolve(dir, '.env.local');
  const lines = readFileSync(envLocal, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx);
    const val = trimmed.slice(eqIdx + 1).replace(/^["']|["']$/g, '');
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
} catch {
  // .env.local is optional
}

function getDatabaseConfig(): { connectionString: string } | {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
} {
  // Prefer POSTGRES_URL connection string (Vercel/Neon format)
  const connStr = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (connStr) {
    return { connectionString: connStr };
  }

  // Fall back to individual vars
  return {
    host: process.env.DB_HOST || process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || process.env.POSTGRES_DATABASE || 'lobsters_university',
    user: process.env.DB_USER || process.env.POSTGRES_USER || 'postgres',
    password: process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD || 'postgres',
  };
}

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  database: getDatabaseConfig(),
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxWriteRequests: 30,
  },
  github: {
    repoOwner: process.env.GITHUB_REPO_OWNER || '',
    repoName: process.env.GITHUB_REPO_NAME || '',
    token: process.env.GITHUB_TOKEN || '',
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET || '',
  },
  wikijs: {
    url: process.env.WIKIJS_URL || 'http://localhost:3001',
    graphqlEndpoint: process.env.WIKIJS_GRAPHQL_ENDPOINT || 'http://localhost:3001/graphql',
    apiKey: process.env.WIKIJS_API_KEY || '',
  },
};
