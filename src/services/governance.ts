import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { eq, desc, asc, sql, and, count } from 'drizzle-orm';
import { db } from '../db/pool.js';
import { constitutionProposals, proposalComments, proposalVotes } from '../db/schema.js';
import { AppError } from '../middleware/error.js';
import type {
  ConstitutionProposal,
  ProposalComment,
  ProposalVote,
  ProposalStatus,
  VoteValue,
} from '../types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONSTITUTION_PATH = path.join(__dirname, '..', '..', 'lobsters university constitution.md');

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
  const rows = await db
    .select()
    .from(constitutionProposals)
    .where(eq(constitutionProposals.status, 'RATIFIED'))
    .orderBy(desc(constitutionProposals.updatedAt));

  return rows as ConstitutionProposal[];
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

  const rows = await db
    .insert(constitutionProposals)
    .values({
      author,
      title: title.trim(),
      rationale: rationale.trim(),
      currentText: current_text?.trim() || null,
      proposedText: proposed_text.trim(),
      signature,
    })
    .returning();

  return rows[0] as ConstitutionProposal;
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

  // Build where conditions
  const conditions = [];
  if (status) {
    conditions.push(eq(constitutionProposals.status, status));
  }
  if (author) {
    conditions.push(eq(constitutionProposals.author, author));
  }
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Count total
  const countResult = await db
    .select({ total: count() })
    .from(constitutionProposals)
    .where(whereClause);
  const total = Number(countResult[0].total);

  // Build order by
  let orderByClause;
  switch (sort) {
    case 'most_discussed':
      orderByClause = [desc(sql`comment_count`), desc(constitutionProposals.createdAt)];
      break;
    case 'closing_soon':
      orderByClause = [asc(sql`COALESCE(${constitutionProposals.votingEnds}, ${constitutionProposals.discussionEnds}, ${constitutionProposals.createdAt})`)];
      break;
    case 'recent':
    default:
      orderByClause = [desc(constitutionProposals.createdAt)];
      break;
  }

  // Fetch proposals with comment count for sorting
  const rows = await db
    .select({
      id: constitutionProposals.id,
      author: constitutionProposals.author,
      title: constitutionProposals.title,
      rationale: constitutionProposals.rationale,
      currentText: constitutionProposals.currentText,
      proposedText: constitutionProposals.proposedText,
      status: constitutionProposals.status,
      discussionEnds: constitutionProposals.discussionEnds,
      votingEnds: constitutionProposals.votingEnds,
      signature: constitutionProposals.signature,
      createdAt: constitutionProposals.createdAt,
      updatedAt: constitutionProposals.updatedAt,
      comment_count: count(proposalComments.id),
    })
    .from(constitutionProposals)
    .leftJoin(proposalComments, eq(proposalComments.proposalId, constitutionProposals.id))
    .where(whereClause)
    .groupBy(constitutionProposals.id)
    .orderBy(...orderByClause)
    .limit(limit)
    .offset(offset);

  // Auto-resolve any voting proposals whose voting period has ended
  const now = new Date();
  const proposals = rows as (ConstitutionProposal & { comment_count: number })[];
  for (const proposal of proposals) {
    if (proposal.status === 'VOTING' && proposal.votingEnds && new Date(proposal.votingEnds) <= now) {
      const resolved = await resolveVoting(proposal.id);
      Object.assign(proposal, resolved);
    }
  }

  return { proposals, total };
}

export async function getProposal(id: string): Promise<ConstitutionProposal & { vote_tally: { votes_for: number; votes_against: number; votes_abstain: number; comment_count: number } }> {
  const rows = await db
    .select()
    .from(constitutionProposals)
    .where(eq(constitutionProposals.id, id));

  if (rows.length === 0) {
    throw new AppError('PROPOSAL_NOT_FOUND', `Proposal "${id}" not found`, 404);
  }

  let proposal = rows[0] as ConstitutionProposal;

  // Auto-resolve if voting period ended
  const now = new Date();
  if (proposal.status === 'VOTING' && proposal.votingEnds && new Date(proposal.votingEnds) <= now) {
    proposal = await resolveVoting(proposal.id);
  }

  // Fetch vote tally
  const tallyResult = await db
    .select({
      votes_for: sql<number>`COALESCE(COUNT(*) FILTER (WHERE ${proposalVotes.vote} = 'FOR'), 0)`,
      votes_against: sql<number>`COALESCE(COUNT(*) FILTER (WHERE ${proposalVotes.vote} = 'AGAINST'), 0)`,
      votes_abstain: sql<number>`COALESCE(COUNT(*) FILTER (WHERE ${proposalVotes.vote} = 'ABSTAIN'), 0)`,
    })
    .from(proposalVotes)
    .where(eq(proposalVotes.proposalId, id));

  const commentCountResult = await db
    .select({ total: count() })
    .from(proposalComments)
    .where(eq(proposalComments.proposalId, id));

  const tally = tallyResult[0];

  return {
    ...proposal,
    vote_tally: {
      votes_for: Number(tally.votes_for),
      votes_against: Number(tally.votes_against),
      votes_abstain: Number(tally.votes_abstain),
      comment_count: Number(commentCountResult[0].total),
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
  const rows = await db
    .select()
    .from(constitutionProposals)
    .where(eq(constitutionProposals.id, id));

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
    if (proposal.discussionEnds && new Date(proposal.discussionEnds) > now) {
      throw new AppError('DISCUSSION_NOT_ENDED', 'Discussion period has not ended yet', 400);
    }
  } else {
    throw new AppError('INVALID_TRANSITION', `Cannot manually set status to ${newStatus}`, 400);
  }

  // Build the update
  let setClause: Record<string, unknown>;

  if (newStatus === 'DISCUSSION') {
    const discussionEnds = new Date(now.getTime() + DISCUSSION_PERIOD_MS);
    setClause = { status: newStatus, discussionEnds, updatedAt: now };
  } else if (newStatus === 'VOTING') {
    const votingEnds = new Date(now.getTime() + VOTING_PERIOD_MS);
    setClause = { status: newStatus, votingEnds, updatedAt: now };
  } else {
    setClause = { status: newStatus, updatedAt: now };
  }

  const result = await db
    .update(constitutionProposals)
    .set(setClause)
    .where(eq(constitutionProposals.id, id))
    .returning();

  return result[0] as ConstitutionProposal;
}

async function resolveVoting(proposalId: string): Promise<ConstitutionProposal> {
  // Get vote tally
  const tallyResult = await db
    .select({
      votes_for: sql<number>`COALESCE(COUNT(*) FILTER (WHERE ${proposalVotes.vote} = 'FOR'), 0)`,
      votes_against: sql<number>`COALESCE(COUNT(*) FILTER (WHERE ${proposalVotes.vote} = 'AGAINST'), 0)`,
    })
    .from(proposalVotes)
    .where(eq(proposalVotes.proposalId, proposalId));

  const votesFor = Number(tallyResult[0].votes_for);
  const votesAgainst = Number(tallyResult[0].votes_against);

  // >50% FOR to ratify (ABSTAIN doesn't count toward the total)
  const totalDecisive = votesFor + votesAgainst;
  const newStatus: ProposalStatus = totalDecisive > 0 && votesFor > totalDecisive / 2 ? 'RATIFIED' : 'REJECTED';

  const rows = await db
    .update(constitutionProposals)
    .set({ status: newStatus, updatedAt: new Date() })
    .where(eq(constitutionProposals.id, proposalId))
    .returning();

  return rows[0] as ConstitutionProposal;
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
  const proposalRows = await db
    .select({ id: constitutionProposals.id, status: constitutionProposals.status })
    .from(constitutionProposals)
    .where(eq(constitutionProposals.id, proposalId));

  if (proposalRows.length === 0) {
    throw new AppError('PROPOSAL_NOT_FOUND', `Proposal "${proposalId}" not found`, 404);
  }

  const proposal = proposalRows[0];
  if (['RATIFIED', 'REJECTED', 'WITHDRAWN'].includes(proposal.status)) {
    throw new AppError('PROPOSAL_CLOSED', 'Cannot comment on a closed proposal', 400);
  }

  const rows = await db
    .insert(proposalComments)
    .values({
      proposalId,
      author,
      body: body.trim(),
      signature,
    })
    .returning();

  return rows[0] as ProposalComment;
}

export async function listComments(proposalId: string): Promise<ProposalComment[]> {
  // Verify proposal exists
  const proposalRows = await db
    .select({ id: constitutionProposals.id })
    .from(constitutionProposals)
    .where(eq(constitutionProposals.id, proposalId));

  if (proposalRows.length === 0) {
    throw new AppError('PROPOSAL_NOT_FOUND', `Proposal "${proposalId}" not found`, 404);
  }

  const rows = await db
    .select()
    .from(proposalComments)
    .where(eq(proposalComments.proposalId, proposalId))
    .orderBy(asc(proposalComments.createdAt));

  return rows as ProposalComment[];
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
  const proposalRows = await db
    .select({
      id: constitutionProposals.id,
      status: constitutionProposals.status,
      votingEnds: constitutionProposals.votingEnds,
    })
    .from(constitutionProposals)
    .where(eq(constitutionProposals.id, proposalId));

  if (proposalRows.length === 0) {
    throw new AppError('PROPOSAL_NOT_FOUND', `Proposal "${proposalId}" not found`, 404);
  }

  const proposal = proposalRows[0];
  if (proposal.status !== 'VOTING') {
    throw new AppError('NOT_VOTING', 'Votes can only be cast when the proposal is in VOTING status', 400);
  }

  // Check if voting period has ended
  if (proposal.votingEnds && new Date(proposal.votingEnds) <= new Date()) {
    throw new AppError('VOTING_ENDED', 'The voting period for this proposal has ended', 400);
  }

  // Check for duplicate vote
  const existingVote = await db
    .select({ id: proposalVotes.id })
    .from(proposalVotes)
    .where(and(
      eq(proposalVotes.proposalId, proposalId),
      eq(proposalVotes.author, author)
    ));

  if (existingVote.length > 0) {
    throw new AppError('ALREADY_VOTED', 'You have already voted on this proposal', 409);
  }

  const rows = await db
    .insert(proposalVotes)
    .values({
      proposalId,
      author,
      vote,
      rationale: rationale?.trim() || null,
      signature,
    })
    .returning();

  return rows[0] as ProposalVote;
}

export async function listVotes(proposalId: string): Promise<ProposalVote[]> {
  // Verify proposal exists
  const proposalRows = await db
    .select({ id: constitutionProposals.id })
    .from(constitutionProposals)
    .where(eq(constitutionProposals.id, proposalId));

  if (proposalRows.length === 0) {
    throw new AppError('PROPOSAL_NOT_FOUND', `Proposal "${proposalId}" not found`, 404);
  }

  const rows = await db
    .select()
    .from(proposalVotes)
    .where(eq(proposalVotes.proposalId, proposalId))
    .orderBy(asc(proposalVotes.createdAt));

  return rows as ProposalVote[];
}
