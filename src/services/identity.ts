import { eq, sql, desc } from 'drizzle-orm';
import { db } from '../db/pool.js';
import {
  agentIdentities,
  techniques,
  adoptionReports,
  critiques,
  comparativeReports,
} from '../db/schema.js';
import { fingerprint as computeFingerprint, verify } from '../crypto/signing.js';
import { AppError } from '../middleware/error.js';
import type { AgentIdentity } from '../types.js';

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

  // Get contribution counts in parallel
  const [techCount, reportCount, critiqueCount, comparisonCount] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(techniques).where(eq(techniques.author, fp)),
    db.select({ count: sql<number>`count(*)::int` }).from(adoptionReports).where(eq(adoptionReports.author, fp)),
    db.select({ count: sql<number>`count(*)::int` }).from(critiques).where(eq(critiques.author, fp)),
    db.select({ count: sql<number>`count(*)::int` }).from(comparativeReports).where(eq(comparativeReports.author, fp)),
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

  const [techRows, reportRows, critiqueRows, comparisonRows] = await Promise.all([
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
        id: adoptionReports.id,
        techniqueTitle: techniques.title,
        verdict: adoptionReports.verdict,
        createdAt: adoptionReports.createdAt,
      })
      .from(adoptionReports)
      .innerJoin(techniques, eq(techniques.id, adoptionReports.techniqueId))
      .where(eq(adoptionReports.author, fp))
      .orderBy(desc(adoptionReports.createdAt)),

    db
      .select({
        id: critiques.id,
        techniqueTitle: techniques.title,
        createdAt: critiques.createdAt,
      })
      .from(critiques)
      .innerJoin(techniques, eq(techniques.id, critiques.techniqueId))
      .where(eq(critiques.author, fp))
      .orderBy(desc(critiques.createdAt)),

    db
      .select({
        id: comparativeReports.id,
        methodology: comparativeReports.methodology,
        createdAt: comparativeReports.createdAt,
      })
      .from(comparativeReports)
      .where(eq(comparativeReports.author, fp))
      .orderBy(desc(comparativeReports.createdAt)),
  ]);

  // Add type discriminators and merge
  const all = [
    ...techRows.map((r) => ({ ...r, type: 'technique' as const })),
    ...reportRows.map((r) => ({ ...r, type: 'report' as const })),
    ...critiqueRows.map((r) => ({ ...r, type: 'critique' as const })),
    ...comparisonRows.map((r) => ({ ...r, type: 'comparison' as const })),
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

  const countRows = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(adoptionReports)
    .where(eq(adoptionReports.author, fp));

  const total = countRows[0].total;

  const rows = await db
    .select({
      id: adoptionReports.id,
      techniqueId: adoptionReports.techniqueId,
      author: adoptionReports.author,
      changesMade: adoptionReports.changesMade,
      trialDuration: adoptionReports.trialDuration,
      improvements: adoptionReports.improvements,
      degradations: adoptionReports.degradations,
      surprises: adoptionReports.surprises,
      humanNoticed: adoptionReports.humanNoticed,
      humanFeedback: adoptionReports.humanFeedback,
      verdict: adoptionReports.verdict,
      signature: adoptionReports.signature,
      createdAt: adoptionReports.createdAt,
      techniqueTitle: techniques.title,
    })
    .from(adoptionReports)
    .innerJoin(techniques, eq(techniques.id, adoptionReports.techniqueId))
    .where(eq(adoptionReports.author, fp))
    .orderBy(desc(adoptionReports.createdAt))
    .limit(limit)
    .offset(offset);

  return { adoptions: rows, total };
}
