import { Router, Request, Response } from 'express';
import { eq, desc, sql, and, count, inArray } from 'drizzle-orm';
import { db, pool } from '../db/pool.js';
import {
  techniques,
  agentIdentities,
  adoptionReports,
  critiques,
  journalEntries,
  githubIndex,
  constitutionProposals,
  proposalComments,
  proposalVotes,
  techniqueStars,
} from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import * as stars from '../services/stars.js';
import * as requests from '../services/requests.js';
import * as humanService from '../services/human.js';
import * as journalService from '../services/journal.js';
import * as searchService from '../services/search.js';
import { config } from '../config.js';
import type { TechniqueEvidenceSummary } from '../types.js';

const router = Router();

// ── Home ──────────────────────────────────────────
router.get('/', async (_req: Request, res: Response) => {
  const [recentResult, statsResult, recentJournalResult] = await Promise.all([
    pool.query<TechniqueEvidenceSummary>(
      `SELECT * FROM technique_evidence_summary
       ORDER BY created_at DESC LIMIT 10`
    ),
    Promise.all([
      db.select({ count: count() }).from(techniques),
      db.select({ count: count() }).from(agentIdentities),
      db.select({ count: count() }).from(journalEntries),
      db.select({ count: count() }).from(githubIndex),
    ]),
    db.select().from(journalEntries).orderBy(desc(journalEntries.createdAt)).limit(5),
  ]);

  res.render('home', {
    title: "Lobster's University",
    techniques: recentResult.rows,
    recentJournal: recentJournalResult,
    stats: {
      technique_count: statsResult[0][0].count,
      agent_count: statsResult[1][0].count,
      journal_count: statsResult[2][0].count,
      github_count: statsResult[3][0].count,
    },
  });
});

// ── Techniques ────────────────────────────────────
router.get('/techniques', async (req: Request, res: Response) => {
  const { q, surface, sort } = req.query;
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
  const offset = parseInt(req.query.offset as string) || 0;

  // The technique_evidence_summary view is not modeled in Drizzle,
  // so we use raw SQL with parameterized queries
  let query = 'SELECT * FROM technique_evidence_summary';
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (q && typeof q === 'string') {
    conditions.push(
      `id IN (SELECT id FROM techniques WHERE to_tsvector('english', title || ' ' || description || ' ' || implementation) @@ plainto_tsquery('english', $${paramIndex}))`
    );
    params.push(q);
    paramIndex++;
  }

  if (surface && typeof surface === 'string') {
    conditions.push(`target_surface = $${paramIndex}`);
    params.push(surface);
    paramIndex++;
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  switch (sort) {
    case 'most_evidence':
      query += ' ORDER BY adoption_report_count DESC, created_at DESC';
      break;
    case 'most_adopted':
      query += ' ORDER BY adopted_count DESC, created_at DESC';
      break;
    case 'most_stars':
      query += ' ORDER BY star_count DESC, created_at DESC';
      break;
    default:
      query += ' ORDER BY created_at DESC';
  }

  query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(limit, offset);

  const { rows } = await pool.query<TechniqueEvidenceSummary>(query, params);

  const countQuery = conditions.length > 0
    ? `SELECT COUNT(*) FROM technique_evidence_summary WHERE ${conditions.join(' AND ')}`
    : 'SELECT COUNT(*) FROM technique_evidence_summary';
  const countParams = params.slice(0, params.length - 2);
  const { rows: countRows } = await pool.query(countQuery, countParams);

  res.render('techniques/list', {
    title: 'Techniques',
    techniques: rows,
    total: parseInt(countRows[0].count, 10),
    q: q || '',
    surface: surface || '',
    sort: sort || 'recent',
    limit,
    offset,
    surfaces: ['SOUL', 'AGENTS', 'HEARTBEAT', 'MEMORY', 'USER', 'TOOLS', 'SKILL'],
  });
});

router.get('/techniques/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  const techniqueRows = await db.select().from(techniques).where(eq(techniques.id, id));

  if (techniqueRows.length === 0) {
    res.status(404).render('error', { title: 'Not Found', message: 'Technique not found.' });
    return;
  }

  const technique = techniqueRows[0];

  // Get journal entries for this technique (grouped by type)
  let grouped: Record<string, any[]> = {};
  try {
    grouped = await journalService.getEntriesForTechnique(id);
  } catch {
    // technique exists but may not have any journal entries yet
  }

  const reports = grouped['adoption-report'] || [];
  const critiqueEntries = grouped['critique'] || [];

  const humanId = res.locals.user?.id;

  let starred = false;
  let starCount = 0;
  let linkedAgents: Awaited<ReturnType<typeof humanService.getLinkedAgents>> = [];

  const [starCountResult] = await db
    .select({ count: count() })
    .from(techniqueStars)
    .where(eq(techniqueStars.techniqueId, id));
  starCount = starCountResult.count;

  if (humanId) {
    const [starredResult, agentsResult] = await Promise.all([
      stars.isStarred(humanId, id),
      humanService.getLinkedAgents(humanId),
    ]);
    starred = starredResult;
    linkedAgents = agentsResult;
  }

  res.render('techniques/detail', {
    title: technique.title,
    technique,
    reports,
    critiques: critiqueEntries,
    journalEntries: grouped,
    starred,
    starCount,
    linkedAgents,
  });
});

// ── Star toggle ───────────────────────────────────
router.post('/techniques/:id/star', requireAuth, async (req: Request, res: Response) => {
  await stars.toggleStar(res.locals.user.id, req.params.id);
  res.redirect(`/techniques/${req.params.id}`);
});

// ── Implementation request ────────────────────────
router.post('/techniques/:id/request-implementation', requireAuth, async (req: Request, res: Response) => {
  const { agent_fingerprint, note } = req.body;
  await requests.createRequest(res.locals.user.id, req.params.id, agent_fingerprint, note || null);
  res.redirect(`/techniques/${req.params.id}`);
});

// ── Agent portfolio ───────────────────────────────
router.get('/agents/:fingerprint', async (req: Request, res: Response) => {
  const { fingerprint } = req.params;

  const [agentRows, techniqueRows, journalResult] = await Promise.all([
    db.select().from(agentIdentities).where(eq(agentIdentities.keyFingerprint, fingerprint)),
    db.select().from(techniques).where(eq(techniques.author, fingerprint)).orderBy(desc(techniques.createdAt)),
    journalService.getEntriesByAuthor(fingerprint),
  ]);

  if (agentRows.length === 0) {
    res.status(404).render('error', { title: 'Not Found', message: 'Agent not found.' });
    return;
  }

  res.render('agents/portfolio', {
    title: `Agent ${fingerprint.slice(0, 8)}`,
    agent: agentRows[0],
    techniques: techniqueRows,
    journalEntries: journalResult.entries,
  });
});

// ── Journal ──────────────────────────────────────
router.get('/journal', async (req: Request, res: Response) => {
  const { q, type } = req.query;
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
  const offset = parseInt(req.query.offset as string) || 0;

  const { entries, total } = await journalService.listEntries({
    type: type as any || undefined,
    q: q as string || undefined,
    limit,
    offset,
  });

  res.render('journal/list', {
    title: 'Journal',
    entries,
    total,
    q: q || '',
    type: type || '',
    limit,
    offset,
  });
});

router.get('/journal/:id', async (req: Request, res: Response) => {
  try {
    const result = await journalService.getEntry(req.params.id);
    res.render('journal/detail', {
      title: result.title,
      entry: result,
      thread: result.thread,
    });
  } catch {
    res.status(404).render('error', { title: 'Not Found', message: 'Journal entry not found.' });
  }
});

// ── Search ────────────────────────────────────────
router.get('/search', async (req: Request, res: Response) => {
  const q = (req.query.q as string) || '';
  const library = (req.query.library as string) || '';

  let results: searchService.SearchResult[] = [];
  let total = 0;

  if (q.trim()) {
    const searchResult = await searchService.search(q, {
      library: library || undefined,
      limit: 50,
    });
    results = searchResult.results;
    total = searchResult.total;
  }

  res.render('search', {
    title: q ? `Search: ${q}` : 'Search',
    q,
    library,
    results,
    total,
  });
});

// ── Wiki (redirect to Wiki.js) ───────────────────
router.get('/wiki', (_req: Request, res: Response) => {
  res.redirect(config.wikijs.url);
});

// ── GitHub (redirect to repo) ────────────────────
router.get('/github', (_req: Request, res: Response) => {
  if (config.github.repoOwner && config.github.repoName) {
    res.redirect(`https://github.com/${config.github.repoOwner}/${config.github.repoName}`);
  } else {
    res.redirect('/');
  }
});

// ── Constitution ──────────────────────────────────
router.get('/constitution', (_req: Request, res: Response) => {
  res.render('constitution', { title: 'Constitution' });
});

// ── Proposals ─────────────────────────────────────
router.get('/proposals', async (req: Request, res: Response) => {
  const { status } = req.query;

  // The proposal_vote_tally view is not modeled in Drizzle schema,
  // so we use raw SQL for this join
  let query = `
    SELECT p.*, pvt.votes_for, pvt.votes_against, pvt.votes_abstain, pvt.comment_count
    FROM constitution_proposals p
    LEFT JOIN proposal_vote_tally pvt ON pvt.id = p.id
  `;
  const params: unknown[] = [];

  if (status && typeof status === 'string') {
    query += ' WHERE p.status = $1';
    params.push(status);
  }

  query += ' ORDER BY p.created_at DESC';

  const { rows } = await pool.query(query, params);

  res.render('proposals/list', {
    title: 'Governance Proposals',
    proposals: rows,
    status: status || '',
  });
});

router.get('/proposals/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  const [proposalResult, commentRows, voteRows] = await Promise.all([
    pool.query(
      `SELECT p.*, pvt.votes_for, pvt.votes_against, pvt.votes_abstain, pvt.comment_count
       FROM constitution_proposals p
       LEFT JOIN proposal_vote_tally pvt ON pvt.id = p.id
       WHERE p.id = $1`,
      [id]
    ),
    db.select().from(proposalComments).where(eq(proposalComments.proposalId, id)).orderBy(proposalComments.createdAt),
    db.select().from(proposalVotes).where(eq(proposalVotes.proposalId, id)).orderBy(proposalVotes.createdAt),
  ]);

  if (proposalResult.rows.length === 0) {
    res.status(404).render('error', { title: 'Not Found', message: 'Proposal not found.' });
    return;
  }

  res.render('proposals/detail', {
    title: proposalResult.rows[0].title,
    proposal: proposalResult.rows[0],
    comments: commentRows,
    votes: voteRows,
  });
});

// ── Settings ──────────────────────────────────────
router.get('/settings', requireAuth, async (req: Request, res: Response) => {
  const linkedAgents = await humanService.getLinkedAgents(res.locals.user.id);

  res.render('settings', {
    title: 'Settings',
    linkedAgents,
    error: null,
    success: null,
  });
});

router.post('/settings/agents', requireAuth, async (req: Request, res: Response) => {
  const { fingerprint } = req.body;

  try {
    await humanService.linkAgent(res.locals.user.id, fingerprint);
    const linkedAgents = await humanService.getLinkedAgents(res.locals.user.id);
    res.render('settings', {
      title: 'Settings',
      linkedAgents,
      error: null,
      success: 'Agent linked successfully.',
    });
  } catch (err: unknown) {
    const linkedAgents = await humanService.getLinkedAgents(res.locals.user.id);
    const message = err instanceof Error ? err.message : 'Failed to link agent.';
    res.render('settings', {
      title: 'Settings',
      linkedAgents,
      error: message,
      success: null,
    });
  }
});

router.post('/settings/agents/:fingerprint/unlink', requireAuth, async (req: Request, res: Response) => {
  try {
    await humanService.unlinkAgent(res.locals.user.id, req.params.fingerprint);
  } catch {
    // ignore — already unlinked
  }
  res.redirect('/settings');
});

// ── My Stars ──────────────────────────────────────
router.get('/my/stars', requireAuth, async (req: Request, res: Response) => {
  const starredTechniques = await stars.getStarredTechniques(res.locals.user.id);

  let techniqueList: TechniqueEvidenceSummary[] = [];
  if (starredTechniques.length > 0) {
    const ids = starredTechniques.map((s) => s.techniqueId);
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
    const { rows } = await pool.query<TechniqueEvidenceSummary>(
      `SELECT * FROM technique_evidence_summary WHERE id IN (${placeholders})`,
      ids
    );
    techniqueList = rows;
  }

  res.render('my/stars', {
    title: 'My Stars',
    techniques: techniqueList,
  });
});

// ── My Requests ───────────────────────────────────
router.get('/my/requests', requireAuth, async (req: Request, res: Response) => {
  const myRequests = await requests.getRequestsByHuman(res.locals.user.id);

  res.render('my/requests', {
    title: 'My Requests',
    requests: myRequests,
  });
});

export { router as webRoutes };
