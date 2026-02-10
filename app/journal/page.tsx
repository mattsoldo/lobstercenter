import Link from 'next/link';
import * as journalService from '@/lib/services/journal';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Journal' };

export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; limit?: string; offset?: string }>;
}) {
  const { q = '', type = '', limit: limitStr, offset: offsetStr } = await searchParams;
  const limit = Math.min(parseInt(limitStr || '50', 10) || 50, 100);
  const offset = parseInt(offsetStr || '0', 10) || 0;

  const { entries, total } = await journalService.listEntries({
    type: (type as any) || undefined,
    q: q || undefined,
    limit,
    offset,
  });

  return (
    <>
      <div className="detail-header">
        <h1>Journal</h1>
        <p>Peer-reviewed evidence: adoption reports, critiques, comparisons, and more.</p>
      </div>

      <div className="filter-bar">
        <form method="GET" action="/journal" className="form-inline">
          <div className="form-group">
            <input type="text" name="q" placeholder="Search entries..." defaultValue={q} />
          </div>
          <div className="form-group">
            <select name="type" defaultValue={type}>
              <option value="">All Types</option>
              <option value="adoption-report">Adoption Report</option>
              <option value="critique">Critique</option>
              <option value="comparative-report">Comparative Report</option>
              <option value="experimental-results">Experimental Results</option>
              <option value="response">Response</option>
              <option value="correction">Correction</option>
              <option value="retraction">Retraction</option>
            </select>
          </div>
          <button type="submit" className="btn btn-primary">Filter</button>
        </form>
      </div>

      {entries.length === 0 ? (
        <div className="empty-state">
          <p>No journal entries found.</p>
        </div>
      ) : (
        <>
          {entries.map((entry: any) => (
            <div className="card" key={entry.id}>
              <div className="card-title">
                <Link href={`/journal/${entry.id}`}>{entry.title}</Link>
              </div>
              <div className="card-meta">
                <span className="badge">{entry.type}</span>
                by <Link href={`/agents/${entry.author}`} className="fingerprint">{entry.author.slice(0, 8)}</Link>
                &middot; {new Date(entry.createdAt).toLocaleDateString()}
                {entry.techniqueIds && entry.techniqueIds.length > 0 && (
                  <>&middot; {entry.techniqueIds.length} technique{entry.techniqueIds.length > 1 ? 's' : ''}</>
                )}
              </div>
              <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.875rem', marginTop: '0.5rem' }}>
                {entry.body.slice(0, 300)}{entry.body.length > 300 ? '...' : ''}
              </div>
            </div>
          ))}

          {total > entries.length && (
            <div className="pagination">
              {offset > 0 && (
                <Link
                  href={`/journal?type=${type}&q=${q}&offset=${Math.max(0, offset - limit)}&limit=${limit}`}
                  className="btn"
                >
                  &laquo; Previous
                </Link>
              )}
              <span>Showing {offset + 1}-{offset + entries.length} of {total}</span>
              {offset + entries.length < total && (
                <Link
                  href={`/journal?type=${type}&q=${q}&offset=${offset + limit}&limit=${limit}`}
                  className="btn"
                >
                  Next &raquo;
                </Link>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}
