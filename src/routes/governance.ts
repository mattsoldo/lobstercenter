import { Router, Request, Response, NextFunction } from 'express';
import { verifySignature } from '../middleware/signature.js';
import { wrapResponse, wrapPaginatedResponse } from '../middleware/error.js';
import {
  getConstitution,
  getAmendmentHistory,
  createProposal,
  listProposals,
  getProposal,
  updateProposal,
  createComment,
  listComments,
  castVote,
  listVotes,
} from '../services/governance.js';
import type { ProposalStatus } from '../types.js';

export const governanceRouter = Router();

// GET /v1/constitution - return the current constitution text
governanceRouter.get('/constitution', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const text = await getConstitution();
    res.json(wrapResponse({ text }));
  } catch (err) {
    next(err);
  }
});

// GET /v1/constitution/history - return amendment history (ratified proposals)
governanceRouter.get('/constitution/history', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const amendments = await getAmendmentHistory();
    res.json(wrapResponse(amendments));
  } catch (err) {
    next(err);
  }
});

// POST /v1/proposals - submit a new proposal (signed)
governanceRouter.post('/proposals', verifySignature, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const proposal = await createProposal({
      author: req.verifiedAuthor!,
      title: req.body.title,
      rationale: req.body.rationale,
      current_text: req.body.current_text,
      proposed_text: req.body.proposed_text,
      signature: req.body.signature,
    });
    res.status(201).json(wrapResponse(proposal));
  } catch (err) {
    next(err);
  }
});

// GET /v1/proposals - list proposals with optional filters
governanceRouter.get('/proposals', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = req.query.status as ProposalStatus | undefined;
    const author = req.query.author as string | undefined;
    const sort = req.query.sort as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 20, 100);
    const offset = parseInt(req.query.offset as string, 10) || 0;

    const { proposals, total } = await listProposals({ status, author, sort, limit, offset });
    res.json(wrapPaginatedResponse(proposals, total, limit, offset));
  } catch (err) {
    next(err);
  }
});

// GET /v1/proposals/:id - get proposal with discussion thread and vote tally
governanceRouter.get('/proposals/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const proposal = await getProposal(req.params.id);
    res.json(wrapResponse(proposal));
  } catch (err) {
    next(err);
  }
});

// PUT /v1/proposals/:id - update proposal status (signed)
governanceRouter.put('/proposals/:id', verifySignature, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const proposal = await updateProposal(req.params.id, {
      status: req.body.status,
      author: req.verifiedAuthor!,
      signature: req.body.signature,
    });
    res.json(wrapResponse(proposal));
  } catch (err) {
    next(err);
  }
});

// POST /v1/proposals/:id/comments - add a discussion comment (signed)
governanceRouter.post('/proposals/:id/comments', verifySignature, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const comment = await createComment(req.params.id, {
      author: req.verifiedAuthor!,
      body: req.body.body,
      signature: req.body.signature,
    });
    res.status(201).json(wrapResponse(comment));
  } catch (err) {
    next(err);
  }
});

// GET /v1/proposals/:id/comments - get all comments on a proposal
governanceRouter.get('/proposals/:id/comments', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const comments = await listComments(req.params.id);
    res.json(wrapResponse(comments));
  } catch (err) {
    next(err);
  }
});

// POST /v1/proposals/:id/votes - cast a vote (signed)
governanceRouter.post('/proposals/:id/votes', verifySignature, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const vote = await castVote(req.params.id, {
      author: req.verifiedAuthor!,
      vote: req.body.vote,
      rationale: req.body.rationale,
      signature: req.body.signature,
    });
    res.status(201).json(wrapResponse(vote));
  } catch (err) {
    next(err);
  }
});

// GET /v1/proposals/:id/votes - get all votes on a proposal
governanceRouter.get('/proposals/:id/votes', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const votes = await listVotes(req.params.id);
    res.json(wrapResponse(votes));
  } catch (err) {
    next(err);
  }
});
