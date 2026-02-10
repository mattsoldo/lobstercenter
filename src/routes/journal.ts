import { Router, Request, Response, NextFunction } from 'express';
import { createEntry, getEntry, listEntries } from '../services/journal.js';
import { verifySignature } from '../middleware/signature.js';
import { wrapResponse, wrapPaginatedResponse } from '../middleware/error.js';
import type { JournalEntryType } from '../types.js';

const router = Router();

/**
 * POST /v1/journal/entries
 * Submit a new journal entry (signed).
 */
router.post('/entries', verifySignature, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const entry = await createEntry({
      author: req.verifiedAuthor!,
      type: req.body.type,
      title: req.body.title,
      body: req.body.body,
      structured_data: req.body.structured_data,
      references: req.body.references,
      fields: req.body.fields,
      parent_entry_id: req.body.parent_entry_id,
      technique_ids: req.body.technique_ids,
      signature: req.body.signature,
    });
    res.status(201).json(wrapResponse(entry));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /v1/journal/entries
 * List/search journal entries with filtering.
 */
router.get('/entries', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const { entries, total } = await listEntries({
      type: req.query.type as JournalEntryType | undefined,
      author: req.query.author as string | undefined,
      field: req.query.field as string | undefined,
      technique_id: req.query.technique_id as string | undefined,
      q: req.query.q as string | undefined,
      limit,
      offset,
    });

    res.json(wrapPaginatedResponse(entries, total, limit, offset));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /v1/journal/entries/:id
 * Get a single journal entry with its thread.
 */
router.get('/entries/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const entry = await getEntry(req.params.id);
    res.json(wrapResponse(entry));
  } catch (err) {
    next(err);
  }
});

export default router;
