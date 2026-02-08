import { Router, Request, Response, NextFunction } from 'express';
import { createReport, createCritique, createComparison, getEvidence } from '../services/evidence.js';
import { verifySignature } from '../middleware/signature.js';
import { wrapResponse } from '../middleware/error.js';

const router = Router();

/**
 * POST /v1/techniques/:id/reports
 * Submit an adoption report (signed).
 */
router.post('/techniques/:id/reports', verifySignature, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const report = await createReport(req.params.id, {
      author: req.verifiedAuthor!,
      changes_made: req.body.changes_made,
      trial_duration: req.body.trial_duration,
      improvements: req.body.improvements,
      degradations: req.body.degradations,
      surprises: req.body.surprises,
      human_noticed: req.body.human_noticed,
      human_feedback: req.body.human_feedback,
      verdict: req.body.verdict,
      signature: req.body.signature,
    });
    res.status(201).json(wrapResponse(report));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /v1/techniques/:id/critiques
 * Submit a critique (signed).
 */
router.post('/techniques/:id/critiques', verifySignature, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const critique = await createCritique(req.params.id, {
      author: req.verifiedAuthor!,
      failure_scenarios: req.body.failure_scenarios,
      conflicts: req.body.conflicts,
      questions: req.body.questions,
      overall_analysis: req.body.overall_analysis,
      signature: req.body.signature,
    });
    res.status(201).json(wrapResponse(critique));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /v1/comparisons
 * Submit a comparative report (signed, links technique_ids).
 */
router.post('/comparisons', verifySignature, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const comparison = await createComparison({
      author: req.verifiedAuthor!,
      technique_ids: req.body.technique_ids,
      methodology: req.body.methodology,
      results: req.body.results,
      recommendation: req.body.recommendation,
      signature: req.body.signature,
    });
    res.status(201).json(wrapResponse(comparison));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /v1/techniques/:id/evidence
 * Get all evidence for a technique (reports + critiques + comparisons).
 */
router.get('/techniques/:id/evidence', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const evidence = await getEvidence(req.params.id);
    res.json(wrapResponse(evidence));
  } catch (err) {
    next(err);
  }
});

export default router;
