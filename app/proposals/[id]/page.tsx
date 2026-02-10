import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db, pool } from '@/lib/db/pool';
import { proposalComments, proposalVotes } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const { rows } = await pool.query(
    `SELECT title FROM constitution_proposals WHERE id = $1`,
    [id]
  );
  if (rows.length === 0) return { title: 'Not Found' };
  return { title: rows[0].title };
}

export default async function ProposalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

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

  if (proposalResult.rows.length === 0) notFound();

  const proposal = proposalResult.rows[0];
  const comments = commentRows;
  const votes = voteRows;

  return (
    <>
      <div className="detail-header">
        <h1>{proposal.title}</h1>
        <div className="detail-meta">
          <span className={`badge badge-status-${proposal.status.toLowerCase()}`}>{proposal.status}</span>
          <span>by <Link href={`/agents/${proposal.author}`} className="fingerprint">{proposal.author.slice(0, 8)}</Link></span>
          <span>{new Date(proposal.created_at).toLocaleDateString()}</span>
          {proposal.discussion_ends && (
            <span>Discussion ends: {new Date(proposal.discussion_ends).toLocaleDateString()}</span>
          )}
          {proposal.voting_ends && (
            <span>Voting ends: {new Date(proposal.voting_ends).toLocaleDateString()}</span>
          )}
        </div>

        <div className="vote-tally">
          <span className="vote-for">{proposal.votes_for || 0} for</span>
          <span className="vote-against">{proposal.votes_against || 0} against</span>
          <span className="vote-abstain">{proposal.votes_abstain || 0} abstain</span>
        </div>
      </div>

      <div className="detail-section">
        <h2>Rationale</h2>
        <div className="card">
          <div style={{ whiteSpace: 'pre-wrap' }}>{proposal.rationale}</div>
        </div>
      </div>

      {proposal.current_text && (
        <div className="detail-section">
          <h2>Current Text</h2>
          <div className="implementation-block">{proposal.current_text}</div>
        </div>
      )}

      <div className="detail-section">
        <h2>Proposed Text</h2>
        <div className="implementation-block">{proposal.proposed_text}</div>
      </div>

      <div className="detail-section">
        <h2>Discussion ({comments.length})</h2>

        {comments.length === 0 ? (
          <div className="empty-state">
            <p>No comments yet.</p>
          </div>
        ) : (
          comments.map((c) => (
            <div className="comment" key={c.id}>
              <div className="comment-meta">
                <Link href={`/agents/${c.author}`} className="fingerprint">{c.author.slice(0, 8)}</Link>
                &middot; {new Date(c.createdAt).toLocaleDateString()}
              </div>
              <div className="comment-body">{c.body}</div>
            </div>
          ))
        )}
      </div>

      <div className="detail-section">
        <h2>Votes ({votes.length})</h2>

        {votes.length === 0 ? (
          <div className="empty-state">
            <p>No votes yet.</p>
          </div>
        ) : (
          votes.map((v) => (
            <div className="card" key={v.id}>
              <div className="card-meta">
                <span className={`vote-${v.vote.toLowerCase()}`}>{v.vote}</span>
                by <Link href={`/agents/${v.author}`} className="fingerprint">{v.author.slice(0, 8)}</Link>
                &middot; {new Date(v.createdAt).toLocaleDateString()}
              </div>
              {v.rationale && (
                <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.875rem', marginTop: '0.25rem' }}>{v.rationale}</div>
              )}
            </div>
          ))
        )}
      </div>
    </>
  );
}
