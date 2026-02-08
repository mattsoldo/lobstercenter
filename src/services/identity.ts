import { pool } from '../db/pool.js';
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
  const existing = await pool.query(
    'SELECT key_fingerprint FROM agent_identities WHERE key_fingerprint = $1',
    [fp]
  );
  if (existing.rows.length > 0) {
    throw new AppError('IDENTITY_EXISTS', `An identity with fingerprint "${fp}" already exists`, 409);
  }

  const result = await pool.query(
    `INSERT INTO agent_identities (key_fingerprint, public_key)
     VALUES ($1, $2)
     RETURNING *`,
    [fp, publicKey]
  );

  return result.rows[0];
}

/**
 * Get an agent's profile along with a summary of their portfolio.
 */
export async function getIdentity(fp: string) {
  const identityResult = await pool.query(
    'SELECT * FROM agent_identities WHERE key_fingerprint = $1',
    [fp]
  );

  if (identityResult.rows.length === 0) {
    throw new AppError('NOT_FOUND', `No agent found with fingerprint "${fp}"`, 404);
  }

  const identity: AgentIdentity = identityResult.rows[0];

  // Get contribution counts
  const countsResult = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM techniques WHERE author = $1)::int AS technique_count,
       (SELECT COUNT(*) FROM adoption_reports WHERE author = $1)::int AS report_count,
       (SELECT COUNT(*) FROM critiques WHERE author = $1)::int AS critique_count,
       (SELECT COUNT(*) FROM comparative_reports WHERE author = $1)::int AS comparison_count`,
    [fp]
  );

  const counts = countsResult.rows[0];

  return {
    key_fingerprint: identity.key_fingerprint,
    public_key: identity.public_key,
    delegated_from: identity.delegated_from,
    created_at: identity.created_at,
    portfolio: {
      technique_count: counts.technique_count,
      report_count: counts.report_count,
      critique_count: counts.critique_count,
      comparison_count: counts.comparison_count,
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
  const oldResult = await pool.query(
    'SELECT * FROM agent_identities WHERE key_fingerprint = $1',
    [oldFingerprint]
  );

  if (oldResult.rows.length === 0) {
    throw new AppError('NOT_FOUND', `No agent found with fingerprint "${oldFingerprint}"`, 404);
  }

  const oldIdentity: AgentIdentity = oldResult.rows[0];

  // Verify the delegation signature (old key signs the delegation message)
  const delegationContent = {
    old_key: oldFingerprint,
    new_key: newPublicKey,
    timestamp,
  };

  const valid = verify(delegationContent, delegationSignature, oldIdentity.public_key);
  if (!valid) {
    throw new AppError('INVALID_SIGNATURE', 'Delegation signature verification failed', 401);
  }

  const newFingerprint = computeFingerprint(newPublicKey);

  // Check that the new fingerprint doesn't already exist
  const existingNew = await pool.query(
    'SELECT key_fingerprint FROM agent_identities WHERE key_fingerprint = $1',
    [newFingerprint]
  );
  if (existingNew.rows.length > 0) {
    throw new AppError('IDENTITY_EXISTS', `An identity with fingerprint "${newFingerprint}" already exists`, 409);
  }

  const result = await pool.query(
    `INSERT INTO agent_identities (key_fingerprint, public_key, delegated_from, delegation_sig)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [newFingerprint, newPublicKey, oldFingerprint, delegationSignature]
  );

  return result.rows[0];
}

/**
 * Get all contributions by an agent (techniques, reports, critiques, comparisons).
 */
export async function getContributions(fp: string, limit: number, offset: number) {
  // Verify agent exists
  const exists = await pool.query(
    'SELECT 1 FROM agent_identities WHERE key_fingerprint = $1',
    [fp]
  );
  if (exists.rows.length === 0) {
    throw new AppError('NOT_FOUND', `No agent found with fingerprint "${fp}"`, 404);
  }

  const [techniques, reports, critiques, comparisons] = await Promise.all([
    pool.query(
      `SELECT id, title, target_surface, created_at, 'technique' AS type
       FROM techniques WHERE author = $1
       ORDER BY created_at DESC`,
      [fp]
    ),
    pool.query(
      `SELECT ar.id, t.title AS technique_title, ar.verdict, ar.created_at, 'report' AS type
       FROM adoption_reports ar
       JOIN techniques t ON t.id = ar.technique_id
       WHERE ar.author = $1
       ORDER BY ar.created_at DESC`,
      [fp]
    ),
    pool.query(
      `SELECT cr.id, t.title AS technique_title, cr.created_at, 'critique' AS type
       FROM critiques cr
       JOIN techniques t ON t.id = cr.technique_id
       WHERE cr.author = $1
       ORDER BY cr.created_at DESC`,
      [fp]
    ),
    pool.query(
      `SELECT id, methodology, created_at, 'comparison' AS type
       FROM comparative_reports WHERE author = $1
       ORDER BY created_at DESC`,
      [fp]
    ),
  ]);

  // Merge and sort by created_at descending
  const all = [
    ...techniques.rows,
    ...reports.rows,
    ...critiques.rows,
    ...comparisons.rows,
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const total = all.length;
  const paged = all.slice(offset, offset + limit);

  return { contributions: paged, total };
}

/**
 * Get all adoption reports authored by an agent.
 */
export async function getAdoptions(fp: string, limit: number, offset: number) {
  // Verify agent exists
  const exists = await pool.query(
    'SELECT 1 FROM agent_identities WHERE key_fingerprint = $1',
    [fp]
  );
  if (exists.rows.length === 0) {
    throw new AppError('NOT_FOUND', `No agent found with fingerprint "${fp}"`, 404);
  }

  const countResult = await pool.query(
    'SELECT COUNT(*)::int AS total FROM adoption_reports WHERE author = $1',
    [fp]
  );
  const total = countResult.rows[0].total;

  const result = await pool.query(
    `SELECT ar.*, t.title AS technique_title
     FROM adoption_reports ar
     JOIN techniques t ON t.id = ar.technique_id
     WHERE ar.author = $1
     ORDER BY ar.created_at DESC
     LIMIT $2 OFFSET $3`,
    [fp, limit, offset]
  );

  return { adoptions: result.rows, total };
}
