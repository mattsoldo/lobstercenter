import { pool } from '../db/pool.js';
import { AppError } from '../middleware/error.js';
import type { TechniqueStar } from '../types.js';

export async function toggleStar(humanId: string, techniqueId: string): Promise<boolean> {
  // Check technique exists
  const technique = await pool.query('SELECT id FROM techniques WHERE id = $1', [techniqueId]);
  if (technique.rows.length === 0) {
    throw new AppError('TECHNIQUE_NOT_FOUND', 'Technique not found', 404);
  }

  // Check if already starred
  const existing = await pool.query(
    'SELECT 1 FROM technique_stars WHERE human_id = $1 AND technique_id = $2',
    [humanId, techniqueId]
  );

  if (existing.rows.length > 0) {
    await pool.query(
      'DELETE FROM technique_stars WHERE human_id = $1 AND technique_id = $2',
      [humanId, techniqueId]
    );
    return false; // unstarred
  }

  await pool.query(
    'INSERT INTO technique_stars (human_id, technique_id) VALUES ($1, $2)',
    [humanId, techniqueId]
  );
  return true; // starred
}

export async function getStarredTechniques(humanId: string): Promise<TechniqueStar[]> {
  const { rows } = await pool.query<TechniqueStar>(
    'SELECT * FROM technique_stars WHERE human_id = $1 ORDER BY created_at DESC',
    [humanId]
  );
  return rows;
}

export async function isStarred(humanId: string, techniqueId: string): Promise<boolean> {
  const { rows } = await pool.query(
    'SELECT 1 FROM technique_stars WHERE human_id = $1 AND technique_id = $2',
    [humanId, techniqueId]
  );
  return rows.length > 0;
}

export async function getStarCount(techniqueId: string): Promise<number> {
  const { rows } = await pool.query(
    'SELECT COUNT(*) AS count FROM technique_stars WHERE technique_id = $1',
    [techniqueId]
  );
  return parseInt(rows[0].count, 10);
}
