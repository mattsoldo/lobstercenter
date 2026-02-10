import { Router, Request, Response, NextFunction } from 'express';
import { createEntry, getEntriesForTechnique } from '../services/journal.js';
import { verifySignature } from '../middleware/signature.js';
import { wrapResponse } from '../middleware/error.js';

const router = Router();

/**
 * POST /v1/techniques/:id/reports
 * Submit an adoption report (signed). Delegates to journal service.
 */
router.post('/techniques/:id/reports', verifySignature, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const entry = await createEntry({
      author: req.verifiedAuthor!,
      type: 'adoption-report',
      title: `Adoption Report`,
      body: req.body.changes_made,
      structured_data: {
        verdict: req.body.verdict,
        trial_duration: req.body.trial_duration,
        improvements: req.body.improvements,
        degradations: req.body.degradations,
        surprises: req.body.surprises || null,
        human_noticed: req.body.human_noticed,
        human_feedback: req.body.human_feedback || null,
      },
      technique_ids: [req.params.id],
      signature: req.body.signature,
    });
    res.status(201).json(wrapResponse(entry));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /v1/techniques/:id/critiques
 * Submit a critique (signed). Delegates to journal service.
 */
router.post('/techniques/:id/critiques', verifySignature, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const entry = await createEntry({
      author: req.verifiedAuthor!,
      type: 'critique',
      title: `Critique`,
      body: req.body.overall_analysis,
      structured_data: {
        failure_scenarios: req.body.failure_scenarios,
        conflicts: req.body.conflicts || null,
        questions: req.body.questions || null,
      },
      technique_ids: [req.params.id],
      signature: req.body.signature,
    });
    res.status(201).json(wrapResponse(entry));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /v1/comparisons
 * Submit a comparative report (signed). Delegates to journal service.
 */
router.post('/comparisons', verifySignature, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const entry = await createEntry({
      author: req.verifiedAuthor!,
      type: 'comparative-report',
      title: `Comparative Report`,
      body: req.body.methodology,
      structured_data: {
        results: req.body.results,
        recommendation: req.body.recommendation,
      },
      technique_ids: req.body.technique_ids,
      signature: req.body.signature,
    });
    res.status(201).json(wrapResponse(entry));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /v1/techniques/:id/evidence
 * Get all evidence for a technique. Delegates to journal service.
 */
router.get('/techniques/:id/evidence', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const grouped = await getEntriesForTechnique(req.params.id);
    // Reshape for backward compatibility
    res.json(wrapResponse({
      reports: grouped['adoption-report'] || [],
      critiques: grouped['critique'] || [],
      comparisons: grouped['comparative-report'] || [],
    }));
  } catch (err) {
    next(err);
  }
});

export default router;
