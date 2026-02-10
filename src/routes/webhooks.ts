import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { config } from '../config.js';
import { syncPath } from '../services/github.js';

const router = Router();

/**
 * Verify GitHub webhook signature (HMAC-SHA256).
 */
function verifyGithubSignature(payload: string, signature: string | undefined, secret: string): boolean {
  if (!signature || !secret) return false;

  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

/**
 * POST /webhooks/github
 * Receives push events from GitHub, verifies the signature, and triggers re-indexing
 * of changed markdown files.
 */
router.post('/github', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // We need the raw body for signature verification.
    // Express has already parsed it, so we re-serialize.
    const rawBody = JSON.stringify(req.body);
    const signature = req.headers['x-hub-signature-256'] as string | undefined;

    if (config.github.webhookSecret) {
      if (!verifyGithubSignature(rawBody, signature, config.github.webhookSecret)) {
        res.status(401).json({ error: { code: 'INVALID_SIGNATURE', message: 'Webhook signature verification failed' } });
        return;
      }
    }

    const event = req.headers['x-github-event'] as string;

    if (event !== 'push') {
      res.status(200).json({ message: 'Event ignored', event });
      return;
    }

    const payload = req.body;
    const commitSha = payload.after as string;
    const commits = payload.commits as Array<{
      added: string[];
      modified: string[];
      removed: string[];
    }>;

    if (!commits || !Array.isArray(commits)) {
      res.status(200).json({ message: 'No commits in payload' });
      return;
    }

    // Collect all changed markdown files
    const changedPaths = new Set<string>();
    for (const commit of commits) {
      for (const path of [...(commit.added || []), ...(commit.modified || [])]) {
        if (path.endsWith('.md')) {
          changedPaths.add(path);
        }
      }
    }

    // Re-index changed files
    const results: string[] = [];
    for (const path of changedPaths) {
      try {
        await syncPath(path, commitSha);
        results.push(path);
      } catch (err) {
        results.push(`${path}: error - ${(err as Error).message}`);
      }
    }

    res.status(200).json({
      message: 'Webhook processed',
      synced: results.length,
      paths: results,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
