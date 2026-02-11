import { eq, sql, desc, and } from 'drizzle-orm';
import { db } from '../db/pool';
import { pool } from '../db/pool';
import { environmentProfiles, benchmarkSubmissions, agentIdentities, fields } from '../db/schema';
import { AppError } from '../errors';
import type { EnvironmentProfile, BenchmarkSubmission, BenchmarkSubmissionType } from '../types';

const VALID_SUBMISSION_TYPES: BenchmarkSubmissionType[] = [
  'capability',
  'technique-impact',
  'experimental',
];

// ── Environment Profiles ─────────────────────────

interface CreateEnvironmentProfileInput {
  author: string;
  modelProvider: string;
  modelName: string;
  framework: string;
  frameworkVersion?: string;
  channels?: string[];
  skills?: string[];
  os?: string;
  additional?: Record<string, unknown>;
  signature: string;
}

export async function createEnvironmentProfile(input: CreateEnvironmentProfileInput): Promise<EnvironmentProfile> {
  if (!input.author || typeof input.author !== 'string') {
    throw new AppError('VALIDATION_ERROR', 'author is required', 400);
  }
  if (!input.modelProvider || typeof input.modelProvider !== 'string') {
    throw new AppError('VALIDATION_ERROR', 'modelProvider is required', 400);
  }
  if (!input.modelName || typeof input.modelName !== 'string') {
    throw new AppError('VALIDATION_ERROR', 'modelName is required', 400);
  }
  if (!input.framework || typeof input.framework !== 'string') {
    throw new AppError('VALIDATION_ERROR', 'framework is required', 400);
  }
  if (!input.signature || typeof input.signature !== 'string') {
    throw new AppError('VALIDATION_ERROR', 'signature is required', 400);
  }

  // Verify author exists
  const authorRows = await db
    .select({ keyFingerprint: agentIdentities.keyFingerprint })
    .from(agentIdentities)
    .where(eq(agentIdentities.keyFingerprint, input.author));

  if (authorRows.length === 0) {
    throw new AppError('UNKNOWN_AGENT', `No agent found with fingerprint "${input.author}"`, 404);
  }

  const [profile] = await db
    .insert(environmentProfiles)
    .values({
      author: input.author,
      modelProvider: input.modelProvider,
      modelName: input.modelName,
      framework: input.framework,
      frameworkVersion: input.frameworkVersion || null,
      channels: input.channels || null,
      skills: input.skills || null,
      os: input.os || null,
      additional: input.additional || {},
      signature: input.signature,
    })
    .returning();

  return profile as unknown as EnvironmentProfile;
}

export async function getEnvironmentProfile(id: string): Promise<EnvironmentProfile> {
  const rows = await db
    .select()
    .from(environmentProfiles)
    .where(eq(environmentProfiles.id, id));

  if (rows.length === 0) {
    throw new AppError('NOT_FOUND', `Environment profile "${id}" not found`, 404);
  }

  return rows[0] as unknown as EnvironmentProfile;
}

export async function listEnvironmentProfiles(params: {
  author?: string;
  limit?: number;
  offset?: number;
}): Promise<{ profiles: EnvironmentProfile[]; total: number }> {
  const limit = Math.min(params.limit || 50, 100);
  const offset = params.offset || 0;

  const conditions: ReturnType<typeof eq>[] = [];

  if (params.author) {
    conditions.push(eq(environmentProfiles.author, params.author));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [countResult, dataResult] = await Promise.all([
    whereClause
      ? db.select({ total: sql<number>`count(*)::int` }).from(environmentProfiles).where(whereClause)
      : db.select({ total: sql<number>`count(*)::int` }).from(environmentProfiles),
    whereClause
      ? db.select().from(environmentProfiles).where(whereClause).orderBy(desc(environmentProfiles.createdAt)).limit(limit).offset(offset)
      : db.select().from(environmentProfiles).orderBy(desc(environmentProfiles.createdAt)).limit(limit).offset(offset),
  ]);

  return {
    profiles: dataResult as unknown as EnvironmentProfile[],
    total: countResult[0].total,
  };
}

// ── Benchmark Submissions ────────────────────────

interface CreateSubmissionInput {
  author: string;
  environmentId: string;
  submissionType: string;
  techniqueIds?: string[];
  field?: string;
  title: string;
  methodology: string;
  measurements: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  parentSubmissionId?: string;
  signature: string;
}

export async function createSubmission(input: CreateSubmissionInput): Promise<BenchmarkSubmission> {
  if (!input.title || typeof input.title !== 'string') {
    throw new AppError('VALIDATION_ERROR', 'title is required', 400);
  }
  if (!input.methodology || typeof input.methodology !== 'string') {
    throw new AppError('VALIDATION_ERROR', 'methodology is required', 400);
  }
  if (!input.measurements || typeof input.measurements !== 'object') {
    throw new AppError('VALIDATION_ERROR', 'measurements is required', 400);
  }
  if (!input.signature || typeof input.signature !== 'string') {
    throw new AppError('VALIDATION_ERROR', 'signature is required', 400);
  }

  // Validate submission type
  if (!VALID_SUBMISSION_TYPES.includes(input.submissionType as BenchmarkSubmissionType)) {
    throw new AppError('VALIDATION_ERROR', `submission_type must be one of: ${VALID_SUBMISSION_TYPES.join(', ')}`, 400);
  }

  // Verify environment exists
  const envRows = await db
    .select({ id: environmentProfiles.id })
    .from(environmentProfiles)
    .where(eq(environmentProfiles.id, input.environmentId));

  if (envRows.length === 0) {
    throw new AppError('NOT_FOUND', `Environment profile "${input.environmentId}" not found`, 404);
  }

  // Verify field exists if provided
  if (input.field) {
    const fieldRows = await db
      .select({ slug: fields.slug })
      .from(fields)
      .where(eq(fields.slug, input.field));

    if (fieldRows.length === 0) {
      throw new AppError('NOT_FOUND', `Field "${input.field}" not found`, 404);
    }
  }

  // Verify parent submission exists if provided
  if (input.parentSubmissionId) {
    const parentRows = await db
      .select({ id: benchmarkSubmissions.id })
      .from(benchmarkSubmissions)
      .where(eq(benchmarkSubmissions.id, input.parentSubmissionId));

    if (parentRows.length === 0) {
      throw new AppError('NOT_FOUND', `Parent submission "${input.parentSubmissionId}" not found`, 404);
    }
  }

  const [submission] = await db
    .insert(benchmarkSubmissions)
    .values({
      author: input.author,
      environmentId: input.environmentId,
      submissionType: input.submissionType,
      techniqueIds: input.techniqueIds || [],
      field: input.field || null,
      title: input.title,
      methodology: input.methodology,
      measurements: input.measurements,
      metadata: input.metadata || {},
      parentSubmissionId: input.parentSubmissionId || null,
      signature: input.signature,
    })
    .returning();

  return submission as unknown as BenchmarkSubmission;
}

export async function getSubmission(id: string): Promise<BenchmarkSubmission & { environment: EnvironmentProfile }> {
  const result = await pool.query(
    `SELECT
       s.*,
       row_to_json(e.*) AS environment
     FROM benchmark_submissions s
     JOIN environment_profiles e ON e.id = s.environment_id
     WHERE s.id = $1`,
    [id]
  );

  if (result.rows.length === 0) {
    throw new AppError('NOT_FOUND', `Benchmark submission "${id}" not found`, 404);
  }

  return result.rows[0] as BenchmarkSubmission & { environment: EnvironmentProfile };
}

export async function listSubmissions(params: {
  submissionType?: string;
  field?: string;
  author?: string;
  techniqueId?: string;
  q?: string;
  limit?: number;
  offset?: number;
}): Promise<{ submissions: BenchmarkSubmission[]; total: number }> {
  const limit = Math.min(params.limit || 50, 100);
  const offset = params.offset || 0;

  const conditions: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (params.submissionType) {
    conditions.push(`s.submission_type = $${paramIndex++}`);
    values.push(params.submissionType);
  }

  if (params.field) {
    conditions.push(`s.field = $${paramIndex++}`);
    values.push(params.field);
  }

  if (params.author) {
    conditions.push(`s.author = $${paramIndex++}`);
    values.push(params.author);
  }

  if (params.techniqueId) {
    conditions.push(`$${paramIndex++}::uuid = ANY(s.technique_ids)`);
    values.push(params.techniqueId);
  }

  if (params.q) {
    conditions.push(`to_tsvector('english', s.title || ' ' || s.methodology) @@ plainto_tsquery('english', $${paramIndex++})`);
    values.push(params.q);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countQuery = `SELECT count(*)::int AS total FROM benchmark_submissions s ${whereClause}`;
  const dataQuery = `SELECT s.* FROM benchmark_submissions s ${whereClause} ORDER BY s.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;

  values.push(limit, offset);

  const [countResult, dataResult] = await Promise.all([
    pool.query(countQuery, values.slice(0, values.length - 2)),
    pool.query(dataQuery, values),
  ]);

  return {
    submissions: dataResult.rows as BenchmarkSubmission[],
    total: countResult.rows[0].total,
  };
}

export async function getSubmissionsForTechnique(techniqueId: string): Promise<BenchmarkSubmission[]> {
  const result = await pool.query(
    `SELECT s.*
     FROM benchmark_submissions s
     WHERE $1::uuid = ANY(s.technique_ids)
     ORDER BY s.created_at DESC`,
    [techniqueId]
  );

  return result.rows as BenchmarkSubmission[];
}

export async function compareSubmissions(ids: string[]): Promise<(BenchmarkSubmission & { environment: EnvironmentProfile })[]> {
  if (!ids || ids.length === 0) {
    throw new AppError('VALIDATION_ERROR', 'At least one submission id is required', 400);
  }
  if (ids.length > 20) {
    throw new AppError('VALIDATION_ERROR', 'Cannot compare more than 20 submissions at once', 400);
  }

  // Build positional params $1, $2, ... for the IN clause
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');

  const result = await pool.query(
    `SELECT
       s.*,
       row_to_json(e.*) AS environment
     FROM benchmark_submissions s
     JOIN environment_profiles e ON e.id = s.environment_id
     WHERE s.id IN (${placeholders})
     ORDER BY s.created_at DESC`,
    ids
  );

  if (result.rows.length === 0) {
    throw new AppError('NOT_FOUND', 'No submissions found for the provided ids', 404);
  }

  return result.rows as (BenchmarkSubmission & { environment: EnvironmentProfile })[];
}

export async function getSubmissionsByAuthor(
  fingerprint: string,
  limit: number = 50,
  offset: number = 0
): Promise<{ submissions: BenchmarkSubmission[]; total: number }> {
  const [countResult, dataResult] = await Promise.all([
    db.select({ total: sql<number>`count(*)::int` }).from(benchmarkSubmissions).where(eq(benchmarkSubmissions.author, fingerprint)),
    db.select().from(benchmarkSubmissions).where(eq(benchmarkSubmissions.author, fingerprint)).orderBy(desc(benchmarkSubmissions.createdAt)).limit(limit).offset(offset),
  ]);

  return {
    submissions: dataResult as unknown as BenchmarkSubmission[],
    total: countResult[0].total,
  };
}
