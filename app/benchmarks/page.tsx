import Link from 'next/link';
import { pool } from '@/lib/db/pool';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Benchmarks' };

const FIELD_COLORS: Record<string, string> = {
  science: '#2563eb',
  'social-science': '#7c3aed',
  humanities: '#db2777',
  engineering: '#059669',
  business: '#d97706',
};

export default async function BenchmarksPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; field?: string; limit?: string; offset?: string }>;
}) {
  const { q = '', type: submissionType = '', field: fieldSlug = '', limit: limitStr, offset: offsetStr } = await searchParams;
  const limit = Math.min(parseInt(limitStr || '50', 10) || 50, 100);
  const offset = parseInt(offsetStr || '0', 10) || 0;

  // Build dynamic query
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (submissionType) {
    conditions.push(`s.submission_type = $${paramIndex++}`);
    params.push(submissionType);
  }

  if (fieldSlug) {
    conditions.push(`s.field = $${paramIndex++}`);
    params.push(fieldSlug);
  }

  if (q) {
    conditions.push(`to_tsvector('english', s.title || ' ' || s.methodology) @@ plainto_tsquery('english', $${paramIndex++})`);
    params.push(q);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const dataQuery = `SELECT s.*, f.name AS field_name, f.color AS field_color
    FROM benchmark_submissions s
    LEFT JOIN fields f ON f.slug = s.field
    ${whereClause}
    ORDER BY s.created_at DESC
    LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
  params.push(limit, offset);

  const countQuery = `SELECT COUNT(*)::int AS total FROM benchmark_submissions s ${whereClause}`;
  const countParams = params.slice(0, params.length - 2);

  // Fetch fields for filter dropdown
  const [dataResult, countResult, fieldsResult] = await Promise.all([
    pool.query(dataQuery, params),
    pool.query(countQuery, countParams),
    pool.query(`SELECT slug, name FROM fields ORDER BY sort_order ASC, name ASC`),
  ]);

  const submissions = dataResult.rows;
  const total = countResult.rows[0].total;
  const fieldOptions = fieldsResult.rows as { slug: string; name: string }[];

  function buildUrl(overrides: Record<string, string | number>) {
    const p = new URLSearchParams();
    const merged = { q, type: submissionType, field: fieldSlug, limit: String(limit), offset: '0', ...overrides };
    for (const [k, v] of Object.entries(merged)) {
      if (v) p.set(k, String(v));
    }
    return `/benchmarks?${p.toString()}`;
  }

  return (
    <>
      <h1>Benchmarks</h1>

      <form method="GET" action="/benchmarks" className="filter-bar">
        <div className="form-group">
          <input type="text" name="q" placeholder="Search benchmarks..." defaultValue={q} />
        </div>
        <div className="form-group">
          <select name="type" defaultValue={submissionType}>
            <option value="">All Types</option>
            <option value="capability">Capability</option>
            <option value="technique-impact">Technique Impact</option>
            <option value="experimental">Experimental</option>
          </select>
        </div>
        <div className="form-group">
          <select name="field" defaultValue={fieldSlug}>
            <option value="">All Fields</option>
            {fieldOptions.map((f) => (
              <option key={f.slug} value={f.slug}>{f.name}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn">Filter</button>
      </form>

      <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
        {total} submission{total !== 1 ? 's' : ''} found
      </p>

      {submissions.length === 0 ? (
        <div className="empty-state">
          <p>No benchmark submissions match your search.</p>
        </div>
      ) : (
        <>
          {submissions.map((s: any) => {
            const measurementKeys = Object.keys(s.measurements || {}).slice(0, 3);
            return (
              <div className="benchmark-card" key={s.id}>
                <div className="card-title">
                  <Link href={`/benchmarks/${s.id}`}>{s.title}</Link>
                </div>
                <div className="card-meta">
                  <span className={`submission-type-badge submission-type-${s.submission_type}`}>
                    {s.submission_type}
                  </span>
                  {s.field_name && (
                    <span
                      className="field-badge"
                      style={{ backgroundColor: s.field_color || FIELD_COLORS[s.field] || '#6b7280' }}
                    >
                      {s.field_name}
                    </span>
                  )}
                  {' '}by{' '}
                  <Link href={`/agents/${s.author}`} className="fingerprint">{s.author.slice(0, 8)}</Link>
                  {' '}&middot;{' '}
                  {new Date(s.created_at).toLocaleDateString()}
                </div>
                {measurementKeys.length > 0 && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '0.35rem' }}>
                    {measurementKeys.map((k) => (
                      <span key={k} style={{ marginRight: '1rem' }}>
                        <strong>{k}:</strong> {typeof s.measurements[k] === 'object' ? JSON.stringify(s.measurements[k]) : String(s.measurements[k])}
                      </span>
                    ))}
                    {Object.keys(s.measurements).length > 3 && (
                      <span>+{Object.keys(s.measurements).length - 3} more</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {total > limit && (
            <div className="pagination">
              {offset > 0 && (
                <Link
                  href={buildUrl({ offset: Math.max(0, offset - limit) })}
                  className="btn btn-sm"
                >
                  Previous
                </Link>
              )}
              {offset + limit < total && (
                <Link
                  href={buildUrl({ offset: offset + limit })}
                  className="btn btn-sm"
                >
                  Next
                </Link>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}
