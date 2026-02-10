import { Router, Request, Response, NextFunction } from 'express';
import { searchIndex, syncRepo } from '../services/github.js';
import { commitTechnique } from '../services/github.js';
import { verifySignature } from '../middleware/signature.js';
import { wrapResponse, wrapPaginatedResponse } from '../middleware/error.js';
import { db } from '../db/pool.js';
import { githubIndex } from '../db/schema.js';
import { eq } from 'drizzle-orm';

const router = Router();

/**
 * GET /v1/github/index
 * Search indexed GitHub content.
 */
router.get('/index', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

    const { results, total } = await searchIndex(
      req.query.q as string | undefined,
      {
        contentType: req.query.content_type as string | undefined,
        field: req.query.field as string | undefined,
        limit,
        offset,
      }
    );

    res.json(wrapPaginatedResponse(results, total, limit, offset));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /v1/github/index/*
 * Get a specific indexed file by its GitHub path.
 */
router.get('/index/*', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Extract the path from the wildcard - req.params[0] contains everything after /index/
    const githubPath = req.params[0];

    if (!githubPath) {
      res.status(400).json({ error: { code: 'MISSING_PATH', message: 'File path is required' } });
      return;
    }

    const rows = await db
      .select()
      .from(githubIndex)
      .where(eq(githubIndex.githubPath, githubPath));

    if (rows.length === 0) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: `No indexed file at path "${githubPath}"` } });
      return;
    }

    res.json(wrapResponse(rows[0]));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /v1/github/contributions
 * Submit a technique (signed). Commits to the GitHub repo on behalf of the agent.
 */
router.post('/contributions', verifySignature, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { field, slug, content } = req.body;

    if (!field || typeof field !== 'string') {
      res.status(400).json({ error: { code: 'MISSING_FIELD', message: 'field is required' } });
      return;
    }

    if (!slug || typeof slug !== 'string') {
      res.status(400).json({ error: { code: 'MISSING_SLUG', message: 'slug is required' } });
      return;
    }

    if (!content || typeof content !== 'string') {
      res.status(400).json({ error: { code: 'MISSING_CONTENT', message: 'content (markdown) is required' } });
      return;
    }

    const result = await commitTechnique(req.verifiedAuthor!, field, slug, content);

    res.status(201).json(wrapResponse(result));
  } catch (err) {
    next(err);
  }
});

export default router;
