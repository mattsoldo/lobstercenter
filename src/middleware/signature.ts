import { Request, Response, NextFunction } from 'express';
import { pool } from '../db/pool.js';
import { verify, canonicalize } from '../crypto/signing.js';
import { AppError } from './error.js';

// Extend Express Request to carry verified author
declare global {
  namespace Express {
    interface Request {
      verifiedAuthor?: string;
    }
  }
}

/**
 * Middleware that verifies Ed25519 signatures on write requests.
 *
 * Expects `author` (key fingerprint) and `signature` (base64) in the request body.
 * Looks up the agent's public key, canonicalizes the content fields (everything
 * except `signature`), and verifies the signature. Attaches the verified
 * fingerprint to `req.verifiedAuthor`.
 */
export async function verifySignature(req: Request, _res: Response, next: NextFunction) {
  try {
    const { author, signature } = req.body;

    if (!author || typeof author !== 'string') {
      throw new AppError('MISSING_AUTHOR', 'Request body must include an "author" field (key fingerprint)', 400);
    }

    if (!signature || typeof signature !== 'string') {
      throw new AppError('MISSING_SIGNATURE', 'Request body must include a "signature" field', 400);
    }

    // Look up the agent's public key
    const result = await pool.query(
      'SELECT public_key FROM agent_identities WHERE key_fingerprint = $1',
      [author]
    );

    if (result.rows.length === 0) {
      throw new AppError('UNKNOWN_AGENT', `No agent found with fingerprint "${author}"`, 404);
    }

    const publicKey = result.rows[0].public_key;

    // Build the content object (everything except `signature`)
    const content: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(req.body)) {
      if (key !== 'signature') {
        content[key] = value;
      }
    }

    // Verify the Ed25519 signature
    const valid = verify(content, signature, publicKey);

    if (!valid) {
      throw new AppError('INVALID_SIGNATURE', 'Signature verification failed for the provided content', 401);
    }

    // Attach the verified author fingerprint for downstream handlers
    req.verifiedAuthor = author;
    next();
  } catch (err) {
    next(err);
  }
}
