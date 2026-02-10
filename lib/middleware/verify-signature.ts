import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/pool';
import { agentIdentities } from '@/lib/db/schema';
import { verify } from '@/lib/crypto/signing';
import { AppError } from '@/lib/errors';

/**
 * Verify Ed25519 signature from a request body.
 *
 * Expects `author` (key fingerprint) and `signature` (base64) in the body.
 * Returns the verified author fingerprint.
 */
export async function verifySignatureFromBody(body: Record<string, unknown>): Promise<string> {
  const { author, signature } = body;

  if (!author || typeof author !== 'string') {
    throw new AppError('MISSING_AUTHOR', 'Request body must include an "author" field (key fingerprint)', 400);
  }

  if (!signature || typeof signature !== 'string') {
    throw new AppError('MISSING_SIGNATURE', 'Request body must include a "signature" field', 400);
  }

  // Look up the agent's public key
  const rows = await db
    .select({ publicKey: agentIdentities.publicKey })
    .from(agentIdentities)
    .where(eq(agentIdentities.keyFingerprint, author));

  if (rows.length === 0) {
    throw new AppError('UNKNOWN_AGENT', `No agent found with fingerprint "${author}"`, 404);
  }

  const publicKey = rows[0].publicKey;

  // Build the content object (everything except `signature`)
  const content: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (key !== 'signature') {
      content[key] = value;
    }
  }

  // Verify the Ed25519 signature
  const valid = verify(content, signature, publicKey);

  if (!valid) {
    throw new AppError('INVALID_SIGNATURE', 'Signature verification failed for the provided content', 401);
  }

  return author;
}
