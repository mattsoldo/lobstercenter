import { eq } from 'drizzle-orm';
import { db, pool } from '../db/pool';
import { fields } from '../db/schema';
import { AppError } from '../errors';
import type { Field } from '../types';

export interface FieldWithStats extends Field {
  techniqueCount: number;
  journalEntryCount: number;
  benchmarkCount: number;
  contributorCount: number;
}

export interface FieldActivity {
  type: 'technique' | 'journal_entry' | 'benchmark';
  id: string;
  title: string;
  author: string;
  createdAt: string;
}

/**
 * List all fields ordered by sortOrder, with aggregate stats.
 */
export async function listFields(): Promise<FieldWithStats[]> {
  const { rows } = await pool.query<
    Field & {
      technique_count: string;
      journal_entry_count: string;
      benchmark_count: string;
      contributor_count: string;
    }
  >(`
    SELECT
      f.*,
      COALESCE(t_stats.cnt, 0)::int AS technique_count,
      COALESCE(j_stats.cnt, 0)::int AS journal_entry_count,
      COALESCE(b_stats.cnt, 0)::int AS benchmark_count,
      COALESCE(c_stats.cnt, 0)::int AS contributor_count
    FROM fields f
    LEFT JOIN (
      SELECT field, COUNT(*) AS cnt
      FROM techniques
      WHERE field IS NOT NULL
      GROUP BY field
    ) t_stats ON t_stats.field = f.slug
    LEFT JOIN (
      SELECT unnest(fields) AS field_slug, COUNT(*) AS cnt
      FROM journal_entries
      GROUP BY field_slug
    ) j_stats ON j_stats.field_slug = f.slug
    LEFT JOIN (
      SELECT field, COUNT(*) AS cnt
      FROM benchmark_submissions
      WHERE field IS NOT NULL
      GROUP BY field
    ) b_stats ON b_stats.field = f.slug
    LEFT JOIN (
      SELECT field_slug, COUNT(DISTINCT author) AS cnt
      FROM (
        SELECT field AS field_slug, author FROM techniques WHERE field IS NOT NULL
        UNION ALL
        SELECT unnest(fields) AS field_slug, author FROM journal_entries
        UNION ALL
        SELECT field AS field_slug, author FROM benchmark_submissions WHERE field IS NOT NULL
      ) all_authors
      GROUP BY field_slug
    ) c_stats ON c_stats.field_slug = f.slug
    ORDER BY f.sort_order ASC, f.name ASC
  `);

  return rows.map(mapFieldRow);
}

/**
 * Get a single field by slug with aggregate stats.
 */
export async function getField(slug: string): Promise<FieldWithStats> {
  const { rows } = await pool.query<
    Field & {
      technique_count: string;
      journal_entry_count: string;
      benchmark_count: string;
      contributor_count: string;
    }
  >(`
    SELECT
      f.*,
      (SELECT COUNT(*)::int FROM techniques WHERE field = f.slug) AS technique_count,
      (SELECT COUNT(*)::int FROM journal_entries WHERE f.slug = ANY(fields)) AS journal_entry_count,
      (SELECT COUNT(*)::int FROM benchmark_submissions WHERE field = f.slug) AS benchmark_count,
      (
        SELECT COUNT(DISTINCT author)::int FROM (
          SELECT author FROM techniques WHERE field = f.slug
          UNION ALL
          SELECT author FROM journal_entries WHERE f.slug = ANY(fields)
          UNION ALL
          SELECT author FROM benchmark_submissions WHERE field = f.slug
        ) a
      ) AS contributor_count
    FROM fields f
    WHERE f.slug = $1
  `, [slug]);

  if (rows.length === 0) {
    throw new AppError('NOT_FOUND', `Field "${slug}" not found`, 404);
  }

  return mapFieldRow(rows[0]);
}

/**
 * Get recent activity for a field: techniques, journal entries, and benchmarks combined.
 */
export async function getFieldActivity(slug: string, limit: number = 10): Promise<FieldActivity[]> {
  // Verify field exists
  const fieldRows = await db
    .select({ slug: fields.slug })
    .from(fields)
    .where(eq(fields.slug, slug));

  if (fieldRows.length === 0) {
    throw new AppError('NOT_FOUND', `Field "${slug}" not found`, 404);
  }

  const { rows } = await pool.query<{
    type: string;
    id: string;
    title: string;
    author: string;
    created_at: string;
  }>(`
    (
      SELECT 'technique' AS type, id::text, title, author, created_at
      FROM techniques
      WHERE field = $1
      ORDER BY created_at DESC
      LIMIT $2
    )
    UNION ALL
    (
      SELECT 'journal_entry' AS type, id::text, title, author, created_at
      FROM journal_entries
      WHERE $1 = ANY(fields)
      ORDER BY created_at DESC
      LIMIT $2
    )
    UNION ALL
    (
      SELECT 'benchmark' AS type, id::text, title, author, created_at
      FROM benchmark_submissions
      WHERE field = $1
      ORDER BY created_at DESC
      LIMIT $2
    )
    ORDER BY created_at DESC
    LIMIT $2
  `, [slug, limit]);

  return rows.map((r) => ({
    type: r.type as FieldActivity['type'],
    id: r.id,
    title: r.title,
    author: r.author,
    createdAt: r.created_at,
  }));
}

function mapFieldRow(row: Record<string, unknown>): FieldWithStats {
  return {
    slug: row.slug as string,
    name: row.name as string,
    description: row.description as string,
    guideUrl: (row.guide_url ?? row.guideUrl ?? null) as string | null,
    color: (row.color ?? null) as string | null,
    icon: (row.icon ?? null) as string | null,
    sortOrder: Number(row.sort_order ?? row.sortOrder ?? 0),
    createdAt: new Date(row.created_at as string ?? row.createdAt as string),
    techniqueCount: Number(row.technique_count ?? 0),
    journalEntryCount: Number(row.journal_entry_count ?? 0),
    benchmarkCount: Number(row.benchmark_count ?? 0),
    contributorCount: Number(row.contributor_count ?? 0),
  };
}
