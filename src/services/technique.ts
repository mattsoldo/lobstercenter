import { pool } from '../db/pool.js';
import { AppError } from '../middleware/error.js';
import type { Technique, TargetSurface } from '../types.js';

const VALID_SURFACES: TargetSurface[] = ['SOUL', 'AGENTS', 'HEARTBEAT', 'MEMORY', 'USER', 'TOOLS', 'SKILL'];

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

/**
 * Submit a new technique.
 */
export async function createTechnique(input: CreateTechniqueInput): Promise<Technique> {
  validateTechniqueFields(input);

  const result = await pool.query(
    `INSERT INTO techniques
       (author, title, description, target_surface, target_file,
        implementation, context_model, context_channels, context_workflow, signature)
     VALUES ($1, $2, $3, $4::target_surface, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      input.author,
      input.title,
      input.description,
      input.target_surface,
      input.target_file,
      input.implementation,
      input.context_model || null,
      input.context_channels || null,
      input.context_workflow || null,
      input.signature,
    ]
  );

  return result.rows[0];
}

/**
 * List/search techniques with filtering, full-text search, and sorting.
 */
export async function listTechniques(params: ListTechniquesParams) {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  // Full-text search
  if (params.q) {
    conditions.push(
      `to_tsvector('english', t.title || ' ' || t.description || ' ' || t.implementation) @@ plainto_tsquery('english', $${paramIndex})`
    );
    values.push(params.q);
    paramIndex++;
  }

  // Filter by surface
  if (params.surface) {
    if (!VALID_SURFACES.includes(params.surface)) {
      throw new AppError('INVALID_SURFACE', `Invalid target_surface. Must be one of: ${VALID_SURFACES.join(', ')}`, 400);
    }
    conditions.push(`t.target_surface = $${paramIndex}::target_surface`);
    values.push(params.surface);
    paramIndex++;
  }

  // Filter by model
  if (params.model) {
    conditions.push(`t.context_model ILIKE $${paramIndex}`);
    values.push(`%${params.model}%`);
    paramIndex++;
  }

  // Filter by channel
  if (params.channel) {
    conditions.push(`$${paramIndex} = ANY(t.context_channels)`);
    values.push(params.channel);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  // Determine sort order
  let orderClause: string;
  switch (params.sort) {
    case 'most_evidence':
      orderClause = 'ORDER BY (COALESCE(es.adoption_report_count, 0) + COALESCE(es.critique_count, 0)) DESC, t.created_at DESC';
      break;
    case 'most_adopted':
      orderClause = 'ORDER BY COALESCE(es.adopted_count, 0) DESC, t.created_at DESC';
      break;
    case 'recent':
    default:
      orderClause = 'ORDER BY t.created_at DESC';
      break;
  }

  // Count total
  const countQuery = `
    SELECT COUNT(*)::int AS total
    FROM techniques t
    LEFT JOIN technique_evidence_summary es ON es.id = t.id
    ${whereClause}
  `;
  const countResult = await pool.query(countQuery, values);
  const total = countResult.rows[0].total;

  // Fetch page
  const dataQuery = `
    SELECT t.*,
           COALESCE(es.adoption_report_count, 0)::int AS adoption_report_count,
           COALESCE(es.critique_count, 0)::int AS critique_count,
           COALESCE(es.adopted_count, 0)::int AS adopted_count,
           COALESCE(es.reverted_count, 0)::int AS reverted_count,
           COALESCE(es.human_noticed_count, 0)::int AS human_noticed_count
    FROM techniques t
    LEFT JOIN technique_evidence_summary es ON es.id = t.id
    ${whereClause}
    ${orderClause}
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;
  values.push(params.limit, params.offset);

  const dataResult = await pool.query(dataQuery, values);

  return { techniques: dataResult.rows, total };
}

/**
 * Get a single technique by ID, enriched with evidence summary.
 */
export async function getTechnique(id: string) {
  const result = await pool.query(
    `SELECT t.*,
            COALESCE(es.adoption_report_count, 0)::int AS adoption_report_count,
            COALESCE(es.critique_count, 0)::int AS critique_count,
            COALESCE(es.adopted_count, 0)::int AS adopted_count,
            COALESCE(es.reverted_count, 0)::int AS reverted_count,
            COALESCE(es.human_noticed_count, 0)::int AS human_noticed_count
     FROM techniques t
     LEFT JOIN technique_evidence_summary es ON es.id = t.id
     WHERE t.id = $1`,
    [id]
  );

  if (result.rows.length === 0) {
    throw new AppError('NOT_FOUND', `No technique found with id "${id}"`, 404);
  }

  return result.rows[0];
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
  const existing = await pool.query(
    'SELECT author FROM techniques WHERE id = $1',
    [id]
  );

  if (existing.rows.length === 0) {
    throw new AppError('NOT_FOUND', `No technique found with id "${id}"`, 404);
  }

  if (existing.rows[0].author !== authorFingerprint) {
    throw new AppError('FORBIDDEN', 'Only the original author can update a technique', 403);
  }

  if (updates.target_surface && !VALID_SURFACES.includes(updates.target_surface)) {
    throw new AppError('INVALID_SURFACE', `Invalid target_surface. Must be one of: ${VALID_SURFACES.join(', ')}`, 400);
  }

  // Build dynamic SET clause
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  const fieldMap: Record<string, string> = {
    title: 'title',
    description: 'description',
    target_surface: 'target_surface',
    target_file: 'target_file',
    implementation: 'implementation',
    context_model: 'context_model',
    context_channels: 'context_channels',
    context_workflow: 'context_workflow',
    signature: 'signature',
  };

  for (const [key, column] of Object.entries(fieldMap)) {
    if (key in updates) {
      const val = (updates as unknown as Record<string, unknown>)[key];
      if (column === 'target_surface') {
        setClauses.push(`${column} = $${paramIndex}::target_surface`);
      } else {
        setClauses.push(`${column} = $${paramIndex}`);
      }
      values.push(val);
      paramIndex++;
    }
  }

  setClauses.push(`updated_at = NOW()`);

  values.push(id);
  const result = await pool.query(
    `UPDATE techniques SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );

  return result.rows[0];
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
  if (!input.target_surface || !VALID_SURFACES.includes(input.target_surface)) {
    throw new AppError('INVALID_SURFACE', `target_surface must be one of: ${VALID_SURFACES.join(', ')}`, 400);
  }
  if (!input.target_file || typeof input.target_file !== 'string') {
    throw new AppError('VALIDATION_ERROR', 'target_file is required', 400);
  }
  if (!input.implementation || typeof input.implementation !== 'string') {
    throw new AppError('VALIDATION_ERROR', 'implementation is required', 400);
  }
}
