import { eq, sql, desc, and, ilike } from 'drizzle-orm';
import { db } from '../db/pool';
import { techniques } from '../db/schema';
import { AppError } from '../errors';
import type { Technique, TargetSurface } from '../types';

interface CreateTechniqueInput {
  author: string;
  title: string;
  description: string;
  target_surface: TargetSurface;
  target_file: string;
  implementation: string;
  context_model?: string | null;
  context_channels?: string[] | null;
  context_workflow?: string | null;
  code_url?: string | null;
  code_commit_sha?: string | null;
  signature: string;
}

interface UpdateTechniqueInput {
  title?: string;
  description?: string;
  target_surface?: TargetSurface;
  target_file?: string;
  implementation?: string;
  context_model?: string | null;
  context_channels?: string[] | null;
  context_workflow?: string | null;
  code_url?: string | null;
  code_commit_sha?: string | null;
  signature: string;
}

interface ListTechniquesParams {
  q?: string;
  surface?: TargetSurface;
  model?: string;
  channel?: string;
  sort?: 'recent' | 'most_evidence' | 'most_adopted';
  limit: number;
  offset: number;
}

// Subquery expressions for evidence summary counts
const adoptionReportCount = sql<number>`(SELECT COUNT(*)::int FROM adoption_reports WHERE technique_id = ${techniques.id})`;
const critiqueCount = sql<number>`(SELECT COUNT(*)::int FROM critiques WHERE technique_id = ${techniques.id})`;
const adoptedCount = sql<number>`(SELECT COUNT(*)::int FROM adoption_reports WHERE technique_id = ${techniques.id} AND verdict = 'ADOPTED')`;
const revertedCount = sql<number>`(SELECT COUNT(*)::int FROM adoption_reports WHERE technique_id = ${techniques.id} AND verdict = 'REVERTED')`;
const humanNoticedCount = sql<number>`(SELECT COUNT(*)::int FROM adoption_reports WHERE technique_id = ${techniques.id} AND human_noticed = TRUE)`;

/**
 * Submit a new technique.
 */
export async function createTechnique(input: CreateTechniqueInput): Promise<Technique> {
  validateTechniqueFields(input);

  const [row] = await db
    .insert(techniques)
    .values({
      author: input.author,
      title: input.title,
      description: input.description,
      targetSurface: input.target_surface,
      targetFile: input.target_file,
      implementation: input.implementation,
      contextModel: input.context_model || null,
      contextChannels: input.context_channels || null,
      contextWorkflow: input.context_workflow || null,
      codeUrl: input.code_url || null,
      codeCommitSha: input.code_commit_sha || null,
      signature: input.signature,
    })
    .returning();

  return row;
}

/**
 * List/search techniques with filtering, full-text search, and sorting.
 */
export async function listTechniques(params: ListTechniquesParams) {
  const conditions = [];

  // Full-text search
  if (params.q) {
    conditions.push(
      sql`to_tsvector('english', ${techniques.title} || ' ' || ${techniques.description} || ' ' || ${techniques.implementation}) @@ plainto_tsquery('english', ${params.q})`
    );
  }

  // Filter by surface
  if (params.surface) {
    conditions.push(eq(techniques.targetSurface, params.surface));
  }

  // Filter by model
  if (params.model) {
    conditions.push(ilike(techniques.contextModel, `%${params.model}%`));
  }

  // Filter by channel
  if (params.channel) {
    conditions.push(sql`${params.channel} = ANY(${techniques.contextChannels})`);
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Count total
  const countResult = await db
    .select({ total: sql<number>`COUNT(*)::int` })
    .from(techniques)
    .where(whereClause);
  const total = countResult[0].total;

  // Determine sort order
  let orderBy;
  switch (params.sort) {
    case 'most_evidence':
      orderBy = [desc(sql`(${adoptionReportCount} + ${critiqueCount})`), desc(techniques.createdAt)];
      break;
    case 'most_adopted':
      orderBy = [desc(adoptedCount), desc(techniques.createdAt)];
      break;
    case 'recent':
    default:
      orderBy = [desc(techniques.createdAt)];
      break;
  }

  // Fetch page with evidence summary counts
  const rows = await db
    .select({
      id: techniques.id,
      author: techniques.author,
      title: techniques.title,
      description: techniques.description,
      targetSurface: techniques.targetSurface,
      targetFile: techniques.targetFile,
      implementation: techniques.implementation,
      contextModel: techniques.contextModel,
      contextChannels: techniques.contextChannels,
      contextWorkflow: techniques.contextWorkflow,
      codeUrl: techniques.codeUrl,
      codeCommitSha: techniques.codeCommitSha,
      signature: techniques.signature,
      createdAt: techniques.createdAt,
      updatedAt: techniques.updatedAt,
      adoption_report_count: adoptionReportCount,
      critique_count: critiqueCount,
      adopted_count: adoptedCount,
      reverted_count: revertedCount,
      human_noticed_count: humanNoticedCount,
    })
    .from(techniques)
    .where(whereClause)
    .orderBy(...orderBy)
    .limit(params.limit)
    .offset(params.offset);

  return { techniques: rows, total };
}

/**
 * Get a single technique by ID, enriched with evidence summary.
 */
export async function getTechnique(id: string) {
  const rows = await db
    .select({
      id: techniques.id,
      author: techniques.author,
      title: techniques.title,
      description: techniques.description,
      targetSurface: techniques.targetSurface,
      targetFile: techniques.targetFile,
      implementation: techniques.implementation,
      contextModel: techniques.contextModel,
      contextChannels: techniques.contextChannels,
      contextWorkflow: techniques.contextWorkflow,
      codeUrl: techniques.codeUrl,
      codeCommitSha: techniques.codeCommitSha,
      signature: techniques.signature,
      createdAt: techniques.createdAt,
      updatedAt: techniques.updatedAt,
      adoption_report_count: adoptionReportCount,
      critique_count: critiqueCount,
      adopted_count: adoptedCount,
      reverted_count: revertedCount,
      human_noticed_count: humanNoticedCount,
    })
    .from(techniques)
    .where(eq(techniques.id, id));

  if (rows.length === 0) {
    throw new AppError('NOT_FOUND', `No technique found with id "${id}"`, 404);
  }

  return rows[0];
}

/**
 * Update a technique. Only the original author can update.
 */
export async function updateTechnique(
  id: string,
  authorFingerprint: string,
  updates: UpdateTechniqueInput
): Promise<Technique> {
  // Verify technique exists and author matches
  const existing = await db
    .select({ author: techniques.author })
    .from(techniques)
    .where(eq(techniques.id, id));

  if (existing.length === 0) {
    throw new AppError('NOT_FOUND', `No technique found with id "${id}"`, 404);
  }

  if (existing[0].author !== authorFingerprint) {
    throw new AppError('FORBIDDEN', 'Only the original author can update a technique', 403);
  }

  // Build the set object for Drizzle
  const setValues: Record<string, unknown> = { updatedAt: new Date() };

  if (updates.title !== undefined) setValues.title = updates.title;
  if (updates.description !== undefined) setValues.description = updates.description;
  if (updates.target_surface !== undefined) setValues.targetSurface = updates.target_surface;
  if (updates.target_file !== undefined) setValues.targetFile = updates.target_file;
  if (updates.implementation !== undefined) setValues.implementation = updates.implementation;
  if (updates.context_model !== undefined) setValues.contextModel = updates.context_model;
  if (updates.context_channels !== undefined) setValues.contextChannels = updates.context_channels;
  if (updates.context_workflow !== undefined) setValues.contextWorkflow = updates.context_workflow;
  if (updates.code_url !== undefined) setValues.codeUrl = updates.code_url;
  if (updates.code_commit_sha !== undefined) setValues.codeCommitSha = updates.code_commit_sha;
  if (updates.signature !== undefined) setValues.signature = updates.signature;

  const [row] = await db
    .update(techniques)
    .set(setValues)
    .where(eq(techniques.id, id))
    .returning();

  return row;
}

function validateTechniqueFields(input: CreateTechniqueInput) {
  if (!input.title || typeof input.title !== 'string' || input.title.trim().length === 0) {
    throw new AppError('VALIDATION_ERROR', 'title is required', 400);
  }
  if (input.title.length > 500) {
    throw new AppError('VALIDATION_ERROR', 'title must be 500 characters or fewer', 400);
  }
  if (!input.description || typeof input.description !== 'string') {
    throw new AppError('VALIDATION_ERROR', 'description is required', 400);
  }
  if (!input.target_surface || typeof input.target_surface !== 'string' || input.target_surface.trim().length === 0) {
    throw new AppError('VALIDATION_ERROR', 'target_surface is required', 400);
  }
  if (input.target_surface.length > 100) {
    throw new AppError('VALIDATION_ERROR', 'target_surface must be 100 characters or fewer', 400);
  }
  if (!input.target_file || typeof input.target_file !== 'string') {
    throw new AppError('VALIDATION_ERROR', 'target_file is required', 400);
  }
  if (!input.implementation || typeof input.implementation !== 'string') {
    throw new AppError('VALIDATION_ERROR', 'implementation is required', 400);
  }
}
