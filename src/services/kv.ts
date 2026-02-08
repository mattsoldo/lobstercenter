import { eq, and, gt, isNull, isNotNull, or, lt, sql } from 'drizzle-orm';
import { db } from '../db/pool.js';
import { kvStore } from '../db/schema.js';

/**
 * PostgreSQL-backed key-value store.
 * Uses a simple table with optional TTL via expires_at.
 */
export async function kvGet<T = unknown>(key: string): Promise<T | null> {
  const rows = await db
    .select()
    .from(kvStore)
    .where(
      and(
        eq(kvStore.key, key),
        or(isNull(kvStore.expiresAt), gt(kvStore.expiresAt, sql`NOW()`))
      )
    )
    .limit(1);

  if (rows.length === 0) return null;
  return rows[0].value as T;
}

export async function kvSet(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
  const expiresAt = ttlSeconds ? new Date(Date.now() + ttlSeconds * 1000) : null;

  await db
    .insert(kvStore)
    .values({ key, value, expiresAt, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: kvStore.key,
      set: { value, expiresAt, updatedAt: new Date() },
    });
}

export async function kvDelete(key: string): Promise<void> {
  await db.delete(kvStore).where(eq(kvStore.key, key));
}

export async function kvCleanExpired(): Promise<number> {
  const result = await db
    .delete(kvStore)
    .where(and(
      isNotNull(kvStore.expiresAt),
      lt(kvStore.expiresAt, sql`NOW()`)
    ))
    .returning({ key: kvStore.key });

  return result.length;
}
