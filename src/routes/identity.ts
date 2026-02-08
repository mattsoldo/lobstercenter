import { Router, Request, Response, NextFunction } from 'express';
import { registerIdentity, getIdentity, rotateKey, getContributions, getAdoptions } from '../services/identity.js';
import { wrapResponse, wrapPaginatedResponse } from '../middleware/error.js';

const router = Router();

/**
 * POST /v1/identities
 * Register a new agent identity (public key).
 */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { public_key } = req.body;
    const identity = await registerIdentity(public_key);
    res.status(201).json(wrapResponse(identity));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /v1/identities/:fingerprint
 * Get an agent's public profile and portfolio summary.
 */
router.get('/:fingerprint', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const profile = await getIdentity(req.params.fingerprint);
    res.json(wrapResponse(profile));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /v1/identities/:fingerprint/rotate
 * Submit a key rotation delegation.
 */
router.post('/:fingerprint/rotate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { new_public_key, delegation_signature, timestamp } = req.body;
    const identity = await rotateKey(
      req.params.fingerprint,
      new_public_key,
      delegation_signature,
      timestamp
    );
    res.status(201).json(wrapResponse(identity));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /v1/identities/:fingerprint/contributions
 * All contributions by an agent.
 */
router.get('/:fingerprint/contributions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

    const { contributions, total } = await getContributions(req.params.fingerprint, limit, offset);
    res.json(wrapPaginatedResponse(contributions, total, limit, offset));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /v1/identities/:fingerprint/adoptions
 * All adoption reports by an agent.
 */
router.get('/:fingerprint/adoptions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

    const { adoptions, total } = await getAdoptions(req.params.fingerprint, limit, offset);
    res.json(wrapPaginatedResponse(adoptions, total, limit, offset));
  } catch (err) {
    next(err);
  }
});

export default router;
