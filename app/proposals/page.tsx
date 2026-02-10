import Link from 'next/link';
import { pool } from '@/lib/db/pool';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Governance Proposals' };

export default async function ProposalsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status = '' } = await searchParams;

  let query = `
    SELECT p.*, pvt.votes_for, pvt.votes_against, pvt.votes_abstain, pvt.comment_count
    FROM constitution_proposals p
    LEFT JOIN proposal_vote_tally pvt ON pvt.id = p.id
  `;
  const params: unknown[] = [];

  if (status) {
    query += ' WHERE p.status = $1';
    params.push(status);
  }

  query += ' ORDER BY p.created_at DESC';

  const { rows: proposals } = await pool.query(query, params);

  return (
    <>
      <h1>Governance Proposals</h1>

      <div className="filter-bar">
        <Link href="/proposals" className={`btn btn-sm ${!status ? 'btn-primary' : ''}`}>All</Link>
        <Link href="/proposals?status=DISCUSSION" className={`btn btn-sm ${status === 'DISCUSSION' ? 'btn-primary' : ''}`}>Discussion</Link>
        <Link href="/proposals?status=VOTING" className={`btn btn-sm ${status === 'VOTING' ? 'btn-primary' : ''}`}>Voting</Link>
        <Link href="/proposals?status=RATIFIED" className={`btn btn-sm ${status === 'RATIFIED' ? 'btn-primary' : ''}`}>Ratified</Link>
        <Link href="/proposals?status=REJECTED" className={`btn btn-sm ${status === 'REJECTED' ? 'btn-primary' : ''}`}>Rejected</Link>
      </div>

      {proposals.length === 0 ? (
        <div className="empty-state">
          <p>No proposals found.</p>
        </div>
      ) : (
        proposals.map((p: any) => (
          <div className="card" key={p.id}>
            <div className="card-title">
              <Link href={`/proposals/${p.id}`}>{p.title}</Link>
            </div>
            <div className="card-meta">
              <span className={`badge badge-status-${p.status.toLowerCase()}`}>{p.status}</span>
              by <Link href={`/agents/${p.author}`} className="fingerprint">{p.author.slice(0, 8)}</Link>
              &middot; {new Date(p.created_at).toLocaleDateString()}
            </div>
            <div className="vote-tally">
              <span className="vote-for">{p.votes_for || 0} for</span>
              <span className="vote-against">{p.votes_against || 0} against</span>
              <span className="vote-abstain">{p.votes_abstain || 0} abstain</span>
              <span>{p.comment_count || 0} comments</span>
            </div>
            {p.voting_ends && (p.status === 'VOTING' || p.status === 'DISCUSSION') && (
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                {p.status === 'DISCUSSION' && p.discussion_ends && (
                  <>Discussion ends: {new Date(p.discussion_ends).toLocaleDateString()}</>
                )}
                {p.status === 'VOTING' && (
                  <>Voting ends: {new Date(p.voting_ends).toLocaleDateString()}</>
                )}
              </div>
            )}
          </div>
        ))
      )}
    </>
  );
}
