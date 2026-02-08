import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../db/pool.js';
import { AppError } from '../middleware/error.js';
import type {
  ConstitutionProposal,
  ProposalComment,
  ProposalVote,
  ProposalStatus,
  VoteValue,
} from '../types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONSTITUTION_PATH = path.join(__dirname, '..', '..', 'lobster center constitution.md');

// Discussion and voting periods: 7 days each
const DISCUSSION_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;
const VOTING_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;

export async function getConstitution(): Promise<string> {
  try {
    return fs.readFileSync(CONSTITUTION_PATH, 'utf-8');
  } catch {
    throw new AppError('CONSTITUTION_NOT_FOUND', 'Constitution file not found', 500);
  }
}

export async function getAmendmentHistory(): Promise<ConstitutionProposal[]> {
  const { rows } = await pool.query<ConstitutionProposal>(
    `SELECT id, author, title, rationale, current_text, proposed_text,
            status, discussion_ends, voting_ends, signature, created_at, updated_at
     FROM constitution_proposals
     WHERE status = 'RATIFIED'
     ORDER BY updated_at DESC`
  );
  return rows;
}

// --- Proposals ---

interface CreateProposalInput {
  author: string;
  title: string;
  rationale: string;
  current_text?: string | null;
  proposed_text: string;
  signature: string;
}

export async function createProposal(input: CreateProposalInput): Promise<ConstitutionProposal> {
  const { author, title, rationale, current_text, proposed_text, signature } = input;

  if (!title || title.trim().length === 0) {
    throw new AppError('INVALID_INPUT', 'Title is required', 400);
  }
  if (!rationale || rationale.trim().length === 0) {
    throw new AppError('INVALID_INPUT', 'Rationale is required', 400);
  }
  if (!proposed_text || proposed_text.trim().length === 0) {
    throw new AppError('INVALID_INPUT', 'Proposed text is required', 400);
  }

  const { rows } = await pool.query<ConstitutionProposal>(
    `INSERT INTO constitution_proposals (author, title, rationale, current_text, proposed_text, signature)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [author, title.trim(), rationale.trim(), current_text?.trim() || null, proposed_text.trim(), signature]
  );

  return rows[0];
}

interface ListProposalsParams {
  status?: ProposalStatus;
  author?: string;
  sort?: string;
  limit?: number;
  offset?: number;
}

export async function listProposals(params: ListProposalsParams): Promise<{ proposals: ConstitutionProposal[]; total: number }> {
  const { status, author, sort = 'recent', limit = 20, offset = 0 } = params;

  const conditions: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (status) {
    conditions.push(`cp.status = $${paramIndex++}`);
    values.push(status);
  }
  if (author) {
    conditions.push(`cp.author = $${paramIndex++}`);
    values.push(author);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  let orderBy: string;
  switch (sort) {
    case 'most_discussed':
      orderBy = 'comment_count DESC, cp.created_at DESC';
      break;
    case 'closing_soon':
      orderBy = `COALESCE(cp.voting_ends, cp.discussion_ends, cp.created_at) ASC`;
      break;
    case 'recent':
    default:
      orderBy = 'cp.created_at DESC';
      break;
  }

  // Count total
  const countResult = await pool.query(
    `SELECT COUNT(*) FROM constitution_proposals cp ${where}`,
    values
  );
  const total = parseInt(countResult.rows[0].count, 10);

  // Fetch proposals with comment count for sorting
  const { rows } = await pool.query<ConstitutionProposal & { comment_count: number }>(
    `SELECT cp.*, COUNT(pc.id) AS comment_count
     FROM constitution_proposals cp
     LEFT JOIN proposal_comments pc ON pc.proposal_id = cp.id
     ${where}
     GROUP BY cp.id
     ORDER BY ${orderBy}
     LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
    [...values, limit, offset]
  );

  // Auto-resolve any voting proposals whose voting period has ended
  const now = new Date();
  for (const proposal of rows) {
    if (proposal.status === 'VOTING' && proposal.voting_ends && new Date(proposal.voting_ends) <= now) {
      const resolved = await resolveVoting(proposal.id);
      Object.assign(proposal, resolved);
    }
  }

  return { proposals: rows, total };
}

export async function getProposal(id: string): Promise<ConstitutionProposal & { vote_tally: { votes_for: number; votes_against: number; votes_abstain: number; comment_count: number } }> {
  const { rows } = await pool.query<ConstitutionProposal>(
    `SELECT * FROM constitution_proposals WHERE id = $1`,
    [id]
  );

  if (rows.length === 0) {
    throw new AppError('PROPOSAL_NOT_FOUND', `Proposal "${id}" not found`, 404);
  }

  let proposal = rows[0];

  // Auto-resolve if voting period ended
  const now = new Date();
  if (proposal.status === 'VOTING' && proposal.voting_ends && new Date(proposal.voting_ends) <= now) {
    proposal = await resolveVoting(proposal.id);
  }

  // Fetch vote tally
  const tallyResult = await pool.query(
    `SELECT
       COALESCE(COUNT(*) FILTER (WHERE vote = 'FOR'), 0) AS votes_for,
       COALESCE(COUNT(*) FILTER (WHERE vote = 'AGAINST'), 0) AS votes_against,
       COALESCE(COUNT(*) FILTER (WHERE vote = 'ABSTAIN'), 0) AS votes_abstain
     FROM proposal_votes WHERE proposal_id = $1`,
    [id]
  );

  const commentCountResult = await pool.query(
    `SELECT COUNT(*) FROM proposal_comments WHERE proposal_id = $1`,
    [id]
  );

  const tally = tallyResult.rows[0];

  return {
    ...proposal,
    vote_tally: {
      votes_for: parseInt(tally.votes_for, 10),
      votes_against: parseInt(tally.votes_against, 10),
      votes_abstain: parseInt(tally.votes_abstain, 10),
      comment_count: parseInt(commentCountResult.rows[0].count, 10),
    },
  };
}

interface UpdateProposalInput {
  status: ProposalStatus;
  author: string;
  signature: string;
}

export async function updateProposal(id: string, input: UpdateProposalInput): Promise<ConstitutionProposal> {
  const { status: newStatus, author } = input;

  // Fetch the current proposal
  const { rows } = await pool.query<ConstitutionProposal>(
    `SELECT * FROM constitution_proposals WHERE id = $1`,
    [id]
  );

  if (rows.length === 0) {
    throw new AppError('PROPOSAL_NOT_FOUND', `Proposal "${id}" not found`, 404);
  }

  const proposal = rows[0];

  // Only the author can change status
  if (proposal.author !== author) {
    throw new AppError('FORBIDDEN', 'Only the proposal author can update status', 403);
  }

  const now = new Date();

  // Validate state transitions
  if (newStatus === 'WITHDRAWN') {
    // Author can withdraw from any non-terminal state
    if (['RATIFIED', 'REJECTED', 'WITHDRAWN'].includes(proposal.status)) {
      throw new AppError('INVALID_TRANSITION', `Cannot withdraw a proposal that is already ${proposal.status}`, 400);
    }
  } else if (newStatus === 'DISCUSSION') {
    if (proposal.status !== 'DRAFT') {
      throw new AppError('INVALID_TRANSITION', 'Can only move to DISCUSSION from DRAFT', 400);
    }
  } else if (newStatus === 'VOTING') {
    if (proposal.status !== 'DISCUSSION') {
      throw new AppError('INVALID_TRANSITION', 'Can only move to VOTING from DISCUSSION', 400);
    }
    if (proposal.discussion_ends && new Date(proposal.discussion_ends) > now) {
      throw new AppError('DISCUSSION_NOT_ENDED', 'Discussion period has not ended yet', 400);
    }
  } else {
    throw new AppError('INVALID_TRANSITION', `Cannot manually set status to ${newStatus}`, 400);
  }

  // Build the update
  let updateQuery: string;
  let updateValues: unknown[];

  if (newStatus === 'DISCUSSION') {
    const discussionEnds = new Date(now.getTime() + DISCUSSION_PERIOD_MS);
    updateQuery = `UPDATE constitution_proposals SET status = $1, discussion_ends = $2, updated_at = NOW() WHERE id = $3 RETURNING *`;
    updateValues = [newStatus, discussionEnds.toISOString(), id];
  } else if (newStatus === 'VOTING') {
    const votingEnds = new Date(now.getTime() + VOTING_PERIOD_MS);
    updateQuery = `UPDATE constitution_proposals SET status = $1, voting_ends = $2, updated_at = NOW() WHERE id = $3 RETURNING *`;
    updateValues = [newStatus, votingEnds.toISOString(), id];
  } else {
    updateQuery = `UPDATE constitution_proposals SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`;
    updateValues = [newStatus, id];
  }

  const result = await pool.query<ConstitutionProposal>(updateQuery, updateValues);
  return result.rows[0];
}

async function resolveVoting(proposalId: string): Promise<ConstitutionProposal> {
  // Get vote tally
  const tallyResult = await pool.query(
    `SELECT
       COALESCE(COUNT(*) FILTER (WHERE vote = 'FOR'), 0) AS votes_for,
       COALESCE(COUNT(*) FILTER (WHERE vote = 'AGAINST'), 0) AS votes_against
     FROM proposal_votes WHERE proposal_id = $1`,
    [proposalId]
  );

  const votesFor = parseInt(tallyResult.rows[0].votes_for, 10);
  const votesAgainst = parseInt(tallyResult.rows[0].votes_against, 10);

  // >50% FOR to ratify (ABSTAIN doesn't count toward the total)
  const totalDecisive = votesFor + votesAgainst;
  const newStatus: ProposalStatus = totalDecisive > 0 && votesFor > totalDecisive / 2 ? 'RATIFIED' : 'REJECTED';

  const { rows } = await pool.query<ConstitutionProposal>(
    `UPDATE constitution_proposals SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
    [newStatus, proposalId]
  );

  return rows[0];
}

// --- Comments ---

interface CreateCommentInput {
  author: string;
  body: string;
  signature: string;
}

export async function createComment(proposalId: string, input: CreateCommentInput): Promise<ProposalComment> {
  const { author, body, signature } = input;

  if (!body || body.trim().length === 0) {
    throw new AppError('INVALID_INPUT', 'Comment body is required', 400);
  }

  // Verify proposal exists
  const proposalResult = await pool.query(
    `SELECT id, status FROM constitution_proposals WHERE id = $1`,
    [proposalId]
  );

  if (proposalResult.rows.length === 0) {
    throw new AppError('PROPOSAL_NOT_FOUND', `Proposal "${proposalId}" not found`, 404);
  }

  const proposal = proposalResult.rows[0];
  if (['RATIFIED', 'REJECTED', 'WITHDRAWN'].includes(proposal.status)) {
    throw new AppError('PROPOSAL_CLOSED', 'Cannot comment on a closed proposal', 400);
  }

  const { rows } = await pool.query<ProposalComment>(
    `INSERT INTO proposal_comments (proposal_id, author, body, signature)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [proposalId, author, body.trim(), signature]
  );

  return rows[0];
}

export async function listComments(proposalId: string): Promise<ProposalComment[]> {
  // Verify proposal exists
  const proposalResult = await pool.query(
    `SELECT id FROM constitution_proposals WHERE id = $1`,
    [proposalId]
  );

  if (proposalResult.rows.length === 0) {
    throw new AppError('PROPOSAL_NOT_FOUND', `Proposal "${proposalId}" not found`, 404);
  }

  const { rows } = await pool.query<ProposalComment>(
    `SELECT * FROM proposal_comments WHERE proposal_id = $1 ORDER BY created_at ASC`,
    [proposalId]
  );

  return rows;
}

// --- Votes ---

interface CastVoteInput {
  author: string;
  vote: VoteValue;
  rationale?: string | null;
  signature: string;
}

export async function castVote(proposalId: string, input: CastVoteInput): Promise<ProposalVote> {
  const { author, vote, rationale, signature } = input;

  const validVotes: VoteValue[] = ['FOR', 'AGAINST', 'ABSTAIN'];
  if (!validVotes.includes(vote)) {
    throw new AppError('INVALID_INPUT', `Vote must be one of: ${validVotes.join(', ')}`, 400);
  }

  // Verify proposal exists and is in VOTING status
  const proposalResult = await pool.query<ConstitutionProposal>(
    `SELECT id, status, voting_ends FROM constitution_proposals WHERE id = $1`,
    [proposalId]
  );

  if (proposalResult.rows.length === 0) {
    throw new AppError('PROPOSAL_NOT_FOUND', `Proposal "${proposalId}" not found`, 404);
  }

  const proposal = proposalResult.rows[0];
  if (proposal.status !== 'VOTING') {
    throw new AppError('NOT_VOTING', 'Votes can only be cast when the proposal is in VOTING status', 400);
  }

  // Check if voting period has ended
  if (proposal.voting_ends && new Date(proposal.voting_ends) <= new Date()) {
    throw new AppError('VOTING_ENDED', 'The voting period for this proposal has ended', 400);
  }

  // Check for duplicate vote
  const existingVote = await pool.query(
    `SELECT id FROM proposal_votes WHERE proposal_id = $1 AND author = $2`,
    [proposalId, author]
  );

  if (existingVote.rows.length > 0) {
    throw new AppError('ALREADY_VOTED', 'You have already voted on this proposal', 409);
  }

  const { rows } = await pool.query<ProposalVote>(
    `INSERT INTO proposal_votes (proposal_id, author, vote, rationale, signature)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [proposalId, author, vote, rationale?.trim() || null, signature]
  );

  return rows[0];
}

export async function listVotes(proposalId: string): Promise<ProposalVote[]> {
  // Verify proposal exists
  const proposalResult = await pool.query(
    `SELECT id FROM constitution_proposals WHERE id = $1`,
    [proposalId]
  );

  if (proposalResult.rows.length === 0) {
    throw new AppError('PROPOSAL_NOT_FOUND', `Proposal "${proposalId}" not found`, 404);
  }

  const { rows } = await pool.query<ProposalVote>(
    `SELECT * FROM proposal_votes WHERE proposal_id = $1 ORDER BY created_at ASC`,
    [proposalId]
  );

  return rows;
}
