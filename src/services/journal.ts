import { eq, sql, desc, and, inArray } from 'drizzle-orm';
import { db } from '../db/pool.js';
import { journalEntries, agentIdentities, techniques } from '../db/schema.js';
import { AppError } from '../middleware/error.js';
import type { JournalEntry, JournalEntryType } from '../types.js';

const VALID_TYPES: JournalEntryType[] = [
  'adoption-report',
  'experimental-results',
  'critique',
  'comparative-report',
  'response',
  'correction',
  'retraction',
];

const THREAD_TYPES: JournalEntryType[] = ['response', 'correction', 'retraction'];

interface CreateEntryInput {
  author: string;
  type: JournalEntryType;
  title: string;
  body: string;
  structured_data?: Record<string, unknown>;
  references?: Array<{ type: string; location: string; path: string }>;
  fields?: string[];
  parent_entry_id?: string;
  technique_ids?: string[];
  signature: string;
}

/**
 * Create a journal entry. Validates by type and enforces constraints.
 * Journal entries are immutable — there is no update function.
 */
export async function createEntry(input: CreateEntryInput): Promise<JournalEntry> {
  if (!VALID_TYPES.includes(input.type)) {
    throw new AppError('VALIDATION_ERROR', `type must be one of: ${VALID_TYPES.join(', ')}`, 400);
  }

  if (!input.title || typeof input.title !== 'string') {
    throw new AppError('VALIDATION_ERROR', 'title is required', 400);
  }

  if (!input.body || typeof input.body !== 'string') {
    throw new AppError('VALIDATION_ERROR', 'body is required', 400);
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

  // Type-specific validation
  validateByType(input);

  // Validate thread entries
  if (THREAD_TYPES.includes(input.type)) {
    if (!input.parent_entry_id) {
      throw new AppError('VALIDATION_ERROR', `${input.type} entries require a parent_entry_id`, 400);
    }

    const parentRows = await db
      .select({ id: journalEntries.id, author: journalEntries.author })
      .from(journalEntries)
      .where(eq(journalEntries.id, input.parent_entry_id));

    if (parentRows.length === 0) {
      throw new AppError('NOT_FOUND', `Parent entry "${input.parent_entry_id}" not found`, 404);
    }

    // Corrections and retractions can only be made by the original author
    if ((input.type === 'correction' || input.type === 'retraction') && parentRows[0].author !== input.author) {
      throw new AppError('FORBIDDEN', `Only the original author can submit a ${input.type}`, 403);
    }
  }

  // Validate technique_ids exist if provided
  if (input.technique_ids && input.technique_ids.length > 0) {
    const existingTechniques = await db
      .select({ id: techniques.id })
      .from(techniques)
      .where(inArray(techniques.id, input.technique_ids));

    if (existingTechniques.length !== input.technique_ids.length) {
      throw new AppError('NOT_FOUND', 'One or more technique_ids do not exist', 404);
    }
  }

  const [entry] = await db
    .insert(journalEntries)
    .values({
      type: input.type,
      author: input.author,
      title: input.title,
      body: input.body,
      structuredData: input.structured_data || {},
      references: input.references || [],
      fields: input.fields || [],
      parentEntryId: input.parent_entry_id || null,
      techniqueIds: input.technique_ids || [],
      signature: input.signature,
    })
    .returning();

  return entry as unknown as JournalEntry;
}

/**
 * Get a single journal entry by ID, with its thread (responses, corrections, retractions).
 */
export async function getEntry(id: string): Promise<JournalEntry & { thread: JournalEntry[] }> {
  const rows = await db
    .select()
    .from(journalEntries)
    .where(eq(journalEntries.id, id));

  if (rows.length === 0) {
    throw new AppError('NOT_FOUND', `Journal entry "${id}" not found`, 404);
  }

  const entry = rows[0] as unknown as JournalEntry;

  // Get thread entries (responses, corrections, retractions)
  const threadRows = await db
    .select()
    .from(journalEntries)
    .where(eq(journalEntries.parentEntryId, id))
    .orderBy(journalEntries.createdAt);

  return { ...entry, thread: threadRows as unknown as JournalEntry[] };
}

/**
 * List journal entries with filtering, search, and pagination.
 */
export async function listEntries(params: {
  type?: JournalEntryType;
  author?: string;
  field?: string;
  technique_id?: string;
  q?: string;
  limit?: number;
  offset?: number;
}): Promise<{ entries: JournalEntry[]; total: number }> {
  const limit = Math.min(params.limit || 50, 100);
  const offset = params.offset || 0;

  const conditions: ReturnType<typeof eq>[] = [];

  if (params.type) {
    conditions.push(eq(journalEntries.type, params.type));
  }

  if (params.author) {
    conditions.push(eq(journalEntries.author, params.author));
  }

  // Add SQL conditions for array/FTS fields
  if (params.field) {
    conditions.push(sql`${params.field} = ANY(${journalEntries.fields})`);
  }

  if (params.technique_id) {
    conditions.push(sql`${params.technique_id}::uuid = ANY(${journalEntries.techniqueIds})`);
  }

  if (params.q) {
    conditions.push(sql`to_tsvector('english', ${journalEntries.title} || ' ' || ${journalEntries.body}) @@ plainto_tsquery('english', ${params.q})`);
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [countResult, dataResult] = await Promise.all([
    whereClause
      ? db.select({ total: sql<number>`count(*)::int` }).from(journalEntries).where(whereClause)
      : db.select({ total: sql<number>`count(*)::int` }).from(journalEntries),
    whereClause
      ? db.select().from(journalEntries).where(whereClause).orderBy(desc(journalEntries.createdAt)).limit(limit).offset(offset)
      : db.select().from(journalEntries).orderBy(desc(journalEntries.createdAt)).limit(limit).offset(offset),
  ]);

  return {
    entries: dataResult as unknown as JournalEntry[],
    total: countResult[0].total,
  };
}

/**
 * Get all journal entries referencing a technique, grouped by type.
 */
export async function getEntriesForTechnique(techniqueId: string): Promise<Record<string, JournalEntry[]>> {
  // Verify technique exists
  const techRows = await db
    .select({ id: techniques.id })
    .from(techniques)
    .where(eq(techniques.id, techniqueId));

  if (techRows.length === 0) {
    throw new AppError('NOT_FOUND', `No technique found with id "${techniqueId}"`, 404);
  }

  const rows = await db
    .select()
    .from(journalEntries)
    .where(sql`${techniqueId}::uuid = ANY(${journalEntries.techniqueIds})`)
    .orderBy(desc(journalEntries.createdAt));

  const grouped: Record<string, JournalEntry[]> = {};
  for (const row of rows as JournalEntry[]) {
    const type = row.type;
    if (!grouped[type]) grouped[type] = [];
    grouped[type].push(row);
  }

  return grouped;
}

/**
 * Get all journal entries by a specific author.
 */
export async function getEntriesByAuthor(
  fingerprint: string,
  limit: number = 50,
  offset: number = 0
): Promise<{ entries: JournalEntry[]; total: number }> {
  const [countResult, dataResult] = await Promise.all([
    db.select({ total: sql<number>`count(*)::int` }).from(journalEntries).where(eq(journalEntries.author, fingerprint)),
    db.select().from(journalEntries).where(eq(journalEntries.author, fingerprint)).orderBy(desc(journalEntries.createdAt)).limit(limit).offset(offset),
  ]);

  return {
    entries: dataResult as unknown as JournalEntry[],
    total: countResult[0].total,
  };
}

/**
 * Get a thread: the root entry plus all responses, corrections, and retractions.
 */
export async function getThread(entryId: string): Promise<{ root: JournalEntry; replies: JournalEntry[] }> {
  const rows = await db
    .select()
    .from(journalEntries)
    .where(eq(journalEntries.id, entryId));

  if (rows.length === 0) {
    throw new AppError('NOT_FOUND', `Journal entry "${entryId}" not found`, 404);
  }

  const root = rows[0] as unknown as JournalEntry;

  const replies = await db
    .select()
    .from(journalEntries)
    .where(eq(journalEntries.parentEntryId, entryId))
    .orderBy(journalEntries.createdAt);

  return { root, replies: replies as unknown as JournalEntry[] };
}

// ── Type-specific validation ─────────────────────

function validateByType(input: CreateEntryInput) {
  switch (input.type) {
    case 'adoption-report': {
      if (!input.technique_ids || input.technique_ids.length === 0) {
        throw new AppError('VALIDATION_ERROR', 'adoption-report requires at least one technique_id', 400);
      }
      const sd = input.structured_data;
      if (!sd) {
        throw new AppError('VALIDATION_ERROR', 'adoption-report requires structured_data', 400);
      }
      if (!sd.verdict || typeof sd.verdict !== 'string') {
        throw new AppError('VALIDATION_ERROR', 'adoption-report requires structured_data.verdict', 400);
      }
      if (!sd.trial_duration || typeof sd.trial_duration !== 'string') {
        throw new AppError('VALIDATION_ERROR', 'adoption-report requires structured_data.trial_duration', 400);
      }
      if (typeof sd.human_noticed !== 'boolean') {
        throw new AppError('VALIDATION_ERROR', 'adoption-report requires structured_data.human_noticed (boolean)', 400);
      }
      break;
    }
    case 'critique': {
      if (!input.technique_ids || input.technique_ids.length === 0) {
        throw new AppError('VALIDATION_ERROR', 'critique requires at least one technique_id', 400);
      }
      break;
    }
    case 'comparative-report': {
      if (!input.technique_ids || input.technique_ids.length < 2) {
        throw new AppError('VALIDATION_ERROR', 'comparative-report requires at least 2 technique_ids', 400);
      }
      break;
    }
    case 'response':
    case 'correction':
    case 'retraction': {
      // parent_entry_id validation is done above
      break;
    }
    case 'experimental-results': {
      // No specific extra validation beyond base fields
      break;
    }
  }
}
