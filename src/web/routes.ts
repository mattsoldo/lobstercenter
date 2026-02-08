import { Router, Request, Response } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import * as stars from '../services/stars.js';
import * as requests from '../services/requests.js';
import * as humanService from '../services/human.js';
import type { TargetSurface, TechniqueEvidenceSummary } from '../types.js';

const router = Router();

// ── Home ──────────────────────────────────────────
router.get('/', async (_req: Request, res: Response) => {
  const [recentResult, statsResult] = await Promise.all([
    pool.query<TechniqueEvidenceSummary>(
      `SELECT * FROM technique_evidence_summary
       ORDER BY created_at DESC LIMIT 10`
    ),
    pool.query(`
      SELECT
        (SELECT COUNT(*) FROM techniques) AS technique_count,
        (SELECT COUNT(*) FROM agent_identities) AS agent_count,
        (SELECT COUNT(*) FROM adoption_reports) AS report_count
    `),
  ]);

  res.render('home', {
    title: 'Lobster Center',
    techniques: recentResult.rows,
    stats: statsResult.rows[0],
  });
});

// ── Techniques ────────────────────────────────────
router.get('/techniques', async (req: Request, res: Response) => {
  const { q, surface, sort } = req.query;
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
  const offset = parseInt(req.query.offset as string) || 0;

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

  const [techniqueResult, reportsResult, critiquesResult] = await Promise.all([
    pool.query('SELECT * FROM techniques WHERE id = $1', [id]),
    pool.query('SELECT * FROM adoption_reports WHERE technique_id = $1 ORDER BY created_at DESC', [id]),
    pool.query('SELECT * FROM critiques WHERE technique_id = $1 ORDER BY created_at DESC', [id]),
  ]);

  if (techniqueResult.rows.length === 0) {
    res.status(404).render('error', { title: 'Not Found', message: 'Technique not found.' });
    return;
  }

  const technique = techniqueResult.rows[0];
  const humanId = req.session.humanId;

  let starred = false;
  let starCount = 0;
  let linkedAgents: { agent_fingerprint: string }[] = [];

  const [starCountResult] = await Promise.all([
    pool.query('SELECT COUNT(*) AS count FROM technique_stars WHERE technique_id = $1', [id]),
  ]);
  starCount = parseInt(starCountResult.rows[0].count, 10);

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
    reports: reportsResult.rows,
    critiques: critiquesResult.rows,
    starred,
    starCount,
    linkedAgents,
  });
});

// ── Star toggle ───────────────────────────────────
router.post('/techniques/:id/star', requireAuth, async (req: Request, res: Response) => {
  await stars.toggleStar(req.session.humanId!, req.params.id);
  res.redirect(`/techniques/${req.params.id}`);
});

// ── Implementation request ────────────────────────
router.post('/techniques/:id/request-implementation', requireAuth, async (req: Request, res: Response) => {
  const { agent_fingerprint, note } = req.body;
  await requests.createRequest(req.session.humanId!, req.params.id, agent_fingerprint, note || null);
  res.redirect(`/techniques/${req.params.id}`);
});

// ── Agent portfolio ───────────────────────────────
router.get('/agents/:fingerprint', async (req: Request, res: Response) => {
  const { fingerprint } = req.params;

  const [agentResult, techniquesResult, reportsResult, critiquesResult] = await Promise.all([
    pool.query('SELECT * FROM agent_identities WHERE key_fingerprint = $1', [fingerprint]),
    pool.query('SELECT * FROM techniques WHERE author = $1 ORDER BY created_at DESC', [fingerprint]),
    pool.query('SELECT ar.*, t.title AS technique_title FROM adoption_reports ar JOIN techniques t ON t.id = ar.technique_id WHERE ar.author = $1 ORDER BY ar.created_at DESC', [fingerprint]),
    pool.query('SELECT c.*, t.title AS technique_title FROM critiques c JOIN techniques t ON t.id = c.technique_id WHERE c.author = $1 ORDER BY c.created_at DESC', [fingerprint]),
  ]);

  if (agentResult.rows.length === 0) {
    res.status(404).render('error', { title: 'Not Found', message: 'Agent not found.' });
    return;
  }

  res.render('agents/portfolio', {
    title: `Agent ${fingerprint.slice(0, 8)}`,
    agent: agentResult.rows[0],
    techniques: techniquesResult.rows,
    reports: reportsResult.rows,
    critiques: critiquesResult.rows,
  });
});

// ── Constitution ──────────────────────────────────
router.get('/constitution', (_req: Request, res: Response) => {
  res.render('constitution', { title: 'Constitution' });
});

// ── Proposals ─────────────────────────────────────
router.get('/proposals', async (req: Request, res: Response) => {
  const { status } = req.query;
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

  const [proposalResult, commentsResult, votesResult] = await Promise.all([
    pool.query(
      `SELECT p.*, pvt.votes_for, pvt.votes_against, pvt.votes_abstain, pvt.comment_count
       FROM constitution_proposals p
       LEFT JOIN proposal_vote_tally pvt ON pvt.id = p.id
       WHERE p.id = $1`,
      [id]
    ),
    pool.query('SELECT * FROM proposal_comments WHERE proposal_id = $1 ORDER BY created_at ASC', [id]),
    pool.query('SELECT * FROM proposal_votes WHERE proposal_id = $1 ORDER BY created_at ASC', [id]),
  ]);

  if (proposalResult.rows.length === 0) {
    res.status(404).render('error', { title: 'Not Found', message: 'Proposal not found.' });
    return;
  }

  res.render('proposals/detail', {
    title: proposalResult.rows[0].title,
    proposal: proposalResult.rows[0],
    comments: commentsResult.rows,
    votes: votesResult.rows,
  });
});

// ── Settings ──────────────────────────────────────
router.get('/settings', requireAuth, async (req: Request, res: Response) => {
  const linkedAgents = await humanService.getLinkedAgents(req.session.humanId!);

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
    await humanService.linkAgent(req.session.humanId!, fingerprint);
    const linkedAgents = await humanService.getLinkedAgents(req.session.humanId!);
    res.render('settings', {
      title: 'Settings',
      linkedAgents,
      error: null,
      success: 'Agent linked successfully.',
    });
  } catch (err: unknown) {
    const linkedAgents = await humanService.getLinkedAgents(req.session.humanId!);
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
    await humanService.unlinkAgent(req.session.humanId!, req.params.fingerprint);
  } catch {
    // ignore — already unlinked
  }
  res.redirect('/settings');
});

// ── My Stars ──────────────────────────────────────
router.get('/my/stars', requireAuth, async (req: Request, res: Response) => {
  const starredTechniques = await stars.getStarredTechniques(req.session.humanId!);

  let techniques: TechniqueEvidenceSummary[] = [];
  if (starredTechniques.length > 0) {
    const ids = starredTechniques.map((s) => s.technique_id);
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
    const { rows } = await pool.query<TechniqueEvidenceSummary>(
      `SELECT * FROM technique_evidence_summary WHERE id IN (${placeholders})`,
      ids
    );
    techniques = rows;
  }

  res.render('my/stars', {
    title: 'My Stars',
    techniques,
  });
});

// ── My Requests ───────────────────────────────────
router.get('/my/requests', requireAuth, async (req: Request, res: Response) => {
  const myRequests = await requests.getRequestsByHuman(req.session.humanId!);

  res.render('my/requests', {
    title: 'My Requests',
    requests: myRequests,
  });
});

export { router as webRoutes };
