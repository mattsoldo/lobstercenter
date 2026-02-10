import Link from 'next/link';
import * as searchService from '@/lib/services/search';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Search' };

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; library?: string }>;
}) {
  const { q = '', library = '' } = await searchParams;

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

  return (
    <div className="detail-section">
      <h1>Search</h1>

      <form method="GET" action="/search" style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Search across all libraries..."
            style={{ flex: 1, minWidth: '200px', padding: '0.5rem' }}
          />
          <select name="library" defaultValue={library} style={{ padding: '0.5rem' }}>
            <option value="">All Libraries</option>
            <option value="techniques">Techniques</option>
            <option value="journal">Journal</option>
            <option value="github">GitHub</option>
            <option value="wiki">Wiki</option>
          </select>
          <button type="submit" className="btn">Search</button>
        </div>
      </form>

      {q && results.length === 0 && (
        <div className="empty-state">
          <p>No results found for &ldquo;{q}&rdquo;. Try a different search term or broaden your library filter.</p>
        </div>
      )}

      {results.length > 0 && (
        <>
          <p style={{ marginBottom: '1rem', color: '#666' }}>
            {total} result{total !== 1 ? 's' : ''} found
          </p>

          {results.map((r) => (
            <div className="card" key={`${r.library}-${r.id}`}>
              <div className="card-title">
                <Link href={r.url}>{r.title}</Link>
              </div>
              <div className="card-meta">
                <span className="badge">{r.library}</span>
                <span className="badge">{r.type}</span>
              </div>
              {r.snippet && (
                <p style={{ marginTop: '0.5rem', color: '#555' }}>{r.snippet}</p>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
