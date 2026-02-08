import { eq, and, desc, count } from 'drizzle-orm';
import { db } from '../db/pool.js';
import { techniqueStars, techniques } from '../db/schema.js';
import { AppError } from '../middleware/error.js';
import type { TechniqueStar } from '../types.js';

export async function toggleStar(humanId: string, techniqueId: string): Promise<boolean> {
  // Check technique exists
  const technique = await db
    .select({ id: techniques.id })
    .from(techniques)
    .where(eq(techniques.id, techniqueId));

  if (technique.length === 0) {
    throw new AppError('TECHNIQUE_NOT_FOUND', 'Technique not found', 404);
  }

  // Check if already starred
  const existing = await db
    .select({ humanId: techniqueStars.humanId })
    .from(techniqueStars)
    .where(
      and(
        eq(techniqueStars.humanId, humanId),
        eq(techniqueStars.techniqueId, techniqueId)
      )
    );

  if (existing.length > 0) {
    await db
      .delete(techniqueStars)
      .where(
        and(
          eq(techniqueStars.humanId, humanId),
          eq(techniqueStars.techniqueId, techniqueId)
        )
      );
    return false; // unstarred
  }

  await db
    .insert(techniqueStars)
    .values({ humanId, techniqueId });

  return true; // starred
}

export async function getStarredTechniques(humanId: string): Promise<TechniqueStar[]> {
  const rows = await db
    .select()
    .from(techniqueStars)
    .where(eq(techniqueStars.humanId, humanId))
    .orderBy(desc(techniqueStars.createdAt));

  return rows;
}

export async function isStarred(humanId: string, techniqueId: string): Promise<boolean> {
  const rows = await db
    .select({ humanId: techniqueStars.humanId })
    .from(techniqueStars)
    .where(
      and(
        eq(techniqueStars.humanId, humanId),
        eq(techniqueStars.techniqueId, techniqueId)
      )
    );

  return rows.length > 0;
}

export async function getStarCount(techniqueId: string): Promise<number> {
  const [result] = await db
    .select({ count: count() })
    .from(techniqueStars)
    .where(eq(techniqueStars.techniqueId, techniqueId));

  return result.count;
}
