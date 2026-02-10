import { Router, Request, Response, NextFunction } from 'express';
import { getPage, searchPages, listPages, createPage, updatePage } from '../services/wiki.js';
import { verifySignature } from '../middleware/signature.js';
import { wrapResponse, wrapPaginatedResponse, AppError } from '../middleware/error.js';

const router = Router();

/**
 * GET /v1/wiki/pages
 * List or search wiki pages.
 * Query params: q (search query)
 */
router.get('/pages', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = req.query.q as string | undefined;

    if (query) {
      const searchResult = await searchPages(query);
      res.json(wrapPaginatedResponse(
        searchResult.results,
        searchResult.totalHits,
        searchResult.results.length,
        0
      ));
    } else {
      const pages = await listPages();
      res.json(wrapPaginatedResponse(pages, pages.length, pages.length, 0));
    }
  } catch (err) {
    next(err);
  }
});

/**
 * GET /v1/wiki/pages/*
 * Get a specific wiki page by path.
 */
router.get('/pages/*', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pagePath = req.params[0];
    if (!pagePath) {
      throw new AppError('MISSING_PATH', 'Page path is required', 400);
    }

    const page = await getPage(pagePath);
    if (!page) {
      throw new AppError('NOT_FOUND', `Wiki page not found: ${pagePath}`, 404);
    }

    res.json(wrapResponse(page));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /v1/wiki/pages
 * Create a new wiki page (signed request, proxied to Wiki.js).
 */
router.post('/pages', verifySignature, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { path: pagePath, title, content, description, tags } = req.body;

    if (!pagePath || !title || !content) {
      throw new AppError('MISSING_FIELDS', 'path, title, and content are required', 400);
    }

    const page = await createPage({ path: pagePath, title, content, description, tags });
    res.status(201).json(wrapResponse(page));
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /v1/wiki/pages/:id
 * Update an existing wiki page (signed request, proxied to Wiki.js).
 */
router.put('/pages/:id', verifySignature, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      throw new AppError('INVALID_ID', 'Page ID must be a number', 400);
    }

    const { content, title, description, tags } = req.body;

    await updatePage({ id, content, title, description, tags });
    res.json(wrapResponse({ id, updated: true }));
  } catch (err) {
    next(err);
  }
});

export default router;
