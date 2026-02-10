import { Router, Request, Response, NextFunction } from 'express';
import { search } from '../services/search.js';
import { wrapPaginatedResponse } from '../middleware/error.js';

const router = Router();

/**
 * GET /v1/search
 * Unified cross-library search.
 *
 * Query params:
 *   q       — search query (required)
 *   library — filter to a single library (techniques, journal, github, wiki)
 *   type    — filter by content type / entry type
 *   field   — filter by field / surface
 *   limit   — results per page (default 20, max 100)
 *   offset  — pagination offset
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = req.query.q as string | undefined;

    if (!q || q.trim().length === 0) {
      res.status(400).json({
        error: { code: 'MISSING_QUERY', message: 'q (search query) is required' },
      });
      return;
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

    const { results, total } = await search(q, {
      library: req.query.library as string | undefined,
      type: req.query.type as string | undefined,
      field: req.query.field as string | undefined,
      limit,
      offset,
    });

    res.json(wrapPaginatedResponse(results, total, limit, offset));
  } catch (err) {
    next(err);
  }
});

export default router;
