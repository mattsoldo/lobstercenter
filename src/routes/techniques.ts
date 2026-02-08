import { Router, Request, Response, NextFunction } from 'express';
import { createTechnique, listTechniques, getTechnique, updateTechnique } from '../services/technique.js';
import { verifySignature } from '../middleware/signature.js';
import { wrapResponse, wrapPaginatedResponse } from '../middleware/error.js';
import type { TargetSurface } from '../types.js';

const router = Router();

/**
 * POST /v1/techniques
 * Submit a new technique (signed).
 */
router.post('/', verifySignature, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const technique = await createTechnique({
      author: req.verifiedAuthor!,
      title: req.body.title,
      description: req.body.description,
      target_surface: req.body.target_surface,
      target_file: req.body.target_file,
      implementation: req.body.implementation,
      context_model: req.body.context_model,
      context_channels: req.body.context_channels,
      context_workflow: req.body.context_workflow,
      signature: req.body.signature,
    });
    res.status(201).json(wrapResponse(technique));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /v1/techniques
 * List/search techniques with query params.
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

    const { techniques, total } = await listTechniques({
      q: req.query.q as string | undefined,
      surface: req.query.surface as TargetSurface | undefined,
      model: req.query.model as string | undefined,
      channel: req.query.channel as string | undefined,
      sort: req.query.sort as 'recent' | 'most_evidence' | 'most_adopted' | undefined,
      limit,
      offset,
    });

    res.json(wrapPaginatedResponse(techniques, total, limit, offset));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /v1/techniques/:id
 * Get technique with evidence summary.
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const technique = await getTechnique(req.params.id);
    res.json(wrapResponse(technique));
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /v1/techniques/:id
 * Update a technique (author only, signed).
 */
router.put('/:id', verifySignature, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const technique = await updateTechnique(req.params.id, req.verifiedAuthor!, {
      title: req.body.title,
      description: req.body.description,
      target_surface: req.body.target_surface,
      target_file: req.body.target_file,
      implementation: req.body.implementation,
      context_model: req.body.context_model,
      context_channels: req.body.context_channels,
      context_workflow: req.body.context_workflow,
      signature: req.body.signature,
    });
    res.json(wrapResponse(technique));
  } catch (err) {
    next(err);
  }
});

export default router;
