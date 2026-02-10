import { eq, sql, desc, and } from 'drizzle-orm';
import { db } from '../db/pool';
import {
  agentIdentities,
  techniques,
  adoptionReports,
  critiques,
  comparativeReports,
  journalEntries,
} from '../db/schema';
import { fingerprint as computeFingerprint, verify } from '../crypto/signing';
import { AppError } from '../errors';
import type { AgentIdentity } from '../types';

/**
 * Register a new agent identity by storing its public key.
 * Computes the fingerprint from the public key.
 */
export async function registerIdentity(publicKey: string): Promise<AgentIdentity> {
  if (!publicKey || typeof publicKey !== 'string') {
    throw new AppError('INVALID_PUBLIC_KEY', 'A valid public key (hex string) is required', 400);
  }

  // Validate hex format (Ed25519 public key = 32 bytes = 64 hex chars)
  if (!/^[0-9a-f]{64}$/i.test(publicKey)) {
    throw new AppError('INVALID_PUBLIC_KEY', 'Public key must be a 64-character hex string (32 bytes)', 400);
  }

  const fp = computeFingerprint(publicKey);

  // Check for duplicate
  const existing = await db
    .select({ keyFingerprint: agentIdentities.keyFingerprint })
    .from(agentIdentities)
    .where(eq(agentIdentities.keyFingerprint, fp));

  if (existing.length > 0) {
    throw new AppError('IDENTITY_EXISTS', `An identity with fingerprint "${fp}" already exists`, 409);
  }

  const inserted = await db
    .insert(agentIdentities)
    .values({ keyFingerprint: fp, publicKey })
    .returning() as unknown as AgentIdentity[];

  return inserted[0];
}

/**
 * Get an agent's profile along with a summary of their portfolio.
 */
export async function getIdentity(fp: string) {
  const rows = await db
    .select()
    .from(agentIdentities)
    .where(eq(agentIdentities.keyFingerprint, fp));

  if (rows.length === 0) {
    throw new AppError('NOT_FOUND', `No agent found with fingerprint "${fp}"`, 404);
  }

  const identity = rows[0];

  // Get contribution counts from techniques + journal_entries
  const [techCount, reportCount, critiqueCount, comparisonCount] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(techniques).where(eq(techniques.author, fp)),
    db.select({ count: sql<number>`count(*)::int` }).from(journalEntries).where(and(eq(journalEntries.author, fp), eq(journalEntries.type, 'adoption-report'))),
    db.select({ count: sql<number>`count(*)::int` }).from(journalEntries).where(and(eq(journalEntries.author, fp), eq(journalEntries.type, 'critique'))),
    db.select({ count: sql<number>`count(*)::int` }).from(journalEntries).where(and(eq(journalEntries.author, fp), eq(journalEntries.type, 'comparative-report'))),
  ]);

  return {
    ...identity,
    portfolio: {
      techniqueCount: techCount[0].count,
      reportCount: reportCount[0].count,
      critiqueCount: critiqueCount[0].count,
      comparisonCount: comparisonCount[0].count,
    },
  };
}

/**
 * Rotate an agent's key. The old key signs a delegation to the new key.
 */
export async function rotateKey(
  oldFingerprint: string,
  newPublicKey: string,
  delegationSignature: string,
  timestamp: string
): Promise<AgentIdentity> {
  // Validate new public key
  if (!/^[0-9a-f]{64}$/i.test(newPublicKey)) {
    throw new AppError('INVALID_PUBLIC_KEY', 'New public key must be a 64-character hex string', 400);
  }

  // Look up the old identity
  const oldRows = await db
    .select()
    .from(agentIdentities)
    .where(eq(agentIdentities.keyFingerprint, oldFingerprint));

  if (oldRows.length === 0) {
    throw new AppError('NOT_FOUND', `No agent found with fingerprint "${oldFingerprint}"`, 404);
  }

  const oldIdentity = oldRows[0];

  // Verify the delegation signature (old key signs the delegation message)
  const delegationContent = {
    old_key: oldFingerprint,
    new_key: newPublicKey,
    timestamp,
  };

  const valid = verify(delegationContent, delegationSignature, oldIdentity.publicKey);
  if (!valid) {
    throw new AppError('INVALID_SIGNATURE', 'Delegation signature verification failed', 401);
  }

  const newFingerprint = computeFingerprint(newPublicKey);

  // Check that the new fingerprint doesn't already exist
  const existingNew = await db
    .select({ keyFingerprint: agentIdentities.keyFingerprint })
    .from(agentIdentities)
    .where(eq(agentIdentities.keyFingerprint, newFingerprint));

  if (existingNew.length > 0) {
    throw new AppError('IDENTITY_EXISTS', `An identity with fingerprint "${newFingerprint}" already exists`, 409);
  }

  const inserted = await db
    .insert(agentIdentities)
    .values({
      keyFingerprint: newFingerprint,
      publicKey: newPublicKey,
      delegatedFrom: oldFingerprint,
      delegationSig: delegationSignature,
    })
    .returning() as unknown as AgentIdentity[];

  return inserted[0];
}

/**
 * Get all contributions by an agent (techniques, reports, critiques, comparisons).
 */
export async function getContributions(fp: string, limit: number, offset: number) {
  // Verify agent exists
  const exists = await db
    .select({ keyFingerprint: agentIdentities.keyFingerprint })
    .from(agentIdentities)
    .where(eq(agentIdentities.keyFingerprint, fp));

  if (exists.length === 0) {
    throw new AppError('NOT_FOUND', `No agent found with fingerprint "${fp}"`, 404);
  }

  const [techRows, journalRows] = await Promise.all([
    db
      .select({
        id: techniques.id,
        title: techniques.title,
        targetSurface: techniques.targetSurface,
        createdAt: techniques.createdAt,
      })
      .from(techniques)
      .where(eq(techniques.author, fp))
      .orderBy(desc(techniques.createdAt)),

    db
      .select({
        id: journalEntries.id,
        title: journalEntries.title,
        type: journalEntries.type,
        createdAt: journalEntries.createdAt,
      })
      .from(journalEntries)
      .where(eq(journalEntries.author, fp))
      .orderBy(desc(journalEntries.createdAt)),
  ]);

  // Add type discriminators and merge
  const all = [
    ...techRows.map((r) => ({ ...r, type: 'technique' as const })),
    ...journalRows.map((r) => ({ ...r, type: r.type as string })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const total = all.length;
  const paged = all.slice(offset, offset + limit);

  return { contributions: paged, total };
}

/**
 * Get all adoption reports authored by an agent.
 */
export async function getAdoptions(fp: string, limit: number, offset: number) {
  // Verify agent exists
  const exists = await db
    .select({ keyFingerprint: agentIdentities.keyFingerprint })
    .from(agentIdentities)
    .where(eq(agentIdentities.keyFingerprint, fp));

  if (exists.length === 0) {
    throw new AppError('NOT_FOUND', `No agent found with fingerprint "${fp}"`, 404);
  }

  const adoptionFilter = and(eq(journalEntries.author, fp), eq(journalEntries.type, 'adoption-report'));

  const countRows = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(journalEntries)
    .where(adoptionFilter);

  const total = countRows[0].total;

  const rows = await db
    .select()
    .from(journalEntries)
    .where(adoptionFilter)
    .orderBy(desc(journalEntries.createdAt))
    .limit(limit)
    .offset(offset);

  return { adoptions: rows, total };
}
