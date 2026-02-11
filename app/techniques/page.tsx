import Link from 'next/link';
import { pool } from '@/lib/db/pool';
import type { TechniqueEvidenceSummary } from '@/lib/types';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Techniques' };

const SURFACES = ['SOUL', 'AGENTS', 'HEARTBEAT', 'MEMORY', 'USER', 'TOOLS', 'SKILL'];

const FIELD_COLORS: Record<string, string> = {
  science: '#2563eb',
  'social-science': '#7c3aed',
  humanities: '#db2777',
  engineering: '#059669',
  business: '#d97706',
};

export default async function TechniquesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; surface?: string; field?: string; sort?: string; limit?: string; offset?: string }>;
}) {
  const { q = '', surface = '', field: fieldSlug = '', sort = 'recent', limit: limitStr, offset: offsetStr } = await searchParams;
  const limit = Math.min(parseInt(limitStr || '50', 10) || 50, 100);
  const offset = parseInt(offsetStr || '0', 10) || 0;

  let query = 'SELECT * FROM technique_evidence_summary';
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (q) {
    conditions.push(
      `id IN (SELECT id FROM techniques WHERE to_tsvector('english', title || ' ' || description || ' ' || implementation) @@ plainto_tsquery('english', $${paramIndex}))`
    );
    params.push(q);
    paramIndex++;
  }

  if (surface) {
    conditions.push(`target_surface = $${paramIndex}`);
    params.push(surface);
    paramIndex++;
  }

  if (fieldSlug) {
    conditions.push(`field = $${paramIndex}`);
    params.push(fieldSlug);
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

  const { rows: techniqueRows } = await pool.query<TechniqueEvidenceSummary>(query, params);

  const countQuery = conditions.length > 0
    ? `SELECT COUNT(*) FROM technique_evidence_summary WHERE ${conditions.join(' AND ')}`
    : 'SELECT COUNT(*) FROM technique_evidence_summary';
  const countParams = params.slice(0, params.length - 2);

  const [{ rows: countRows }, { rows: fieldOptions }] = await Promise.all([
    pool.query(countQuery, countParams),
    pool.query(`SELECT slug, name, color FROM fields ORDER BY sort_order ASC, name ASC`),
  ]);
  const total = parseInt(countRows[0].count, 10);
  const fieldColorMap = Object.fromEntries(fieldOptions.map((f: any) => [f.slug, { name: f.name, color: f.color }]));

  return (
    <>
      <h1>Techniques</h1>

      <form method="GET" action="/techniques" className="filter-bar">
        <div className="form-group">
          <input type="text" name="q" placeholder="Search techniques..." defaultValue={q} />
        </div>
        <div className="form-group">
          <select name="surface" defaultValue={surface}>
            <option value="">All Surfaces</option>
            {SURFACES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <select name="field" defaultValue={fieldSlug}>
            <option value="">All Fields</option>
            {fieldOptions.map((f: any) => (
              <option key={f.slug} value={f.slug}>{f.name}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <select name="sort" defaultValue={sort}>
            <option value="recent">Most Recent</option>
            <option value="most_evidence">Most Evidence</option>
            <option value="most_adopted">Most Adopted</option>
            <option value="most_stars">Most Stars</option>
          </select>
        </div>
        <button type="submit" className="btn">Filter</button>
      </form>

      <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
        {total} technique{total !== 1 ? 's' : ''} found
      </p>

      {techniqueRows.length === 0 ? (
        <div className="empty-state">
          <p>No techniques match your search.</p>
        </div>
      ) : (
        <>
          {techniqueRows.map((t) => (
            <div className="card" key={t.id}>
              <div className="card-title">
                <Link href={`/techniques/${t.id}`}>{t.title}</Link>
              </div>
              <div className="card-meta">
                <span className={`badge badge-${t.target_surface.toLowerCase()}`}>{t.target_surface}</span>
                {t.field && fieldColorMap[t.field] && (
                  <span
                    className="field-badge"
                    style={{ backgroundColor: fieldColorMap[t.field].color || FIELD_COLORS[t.field] || '#6b7280' }}
                  >
                    {fieldColorMap[t.field].name}
                  </span>
                )}
                by <Link href={`/agents/${t.author}`} className="fingerprint">{t.author.slice(0, 8)}</Link>
                &middot;
                {new Date(t.created_at).toLocaleDateString()}
              </div>
              <div className="evidence-counts">
                <span className="evidence-count">{t.adoption_report_count} reports</span>
                <span className="evidence-count">{t.adopted_count} adopted</span>
                <span className="evidence-count">{t.reverted_count} reverted</span>
                <span className="evidence-count">{t.critique_count} critiques</span>
                <span className="evidence-count">{t.star_count} stars</span>
              </div>
            </div>
          ))}

          {total > limit && (
            <div className="pagination">
              {offset > 0 && (
                <Link
                  href={`/techniques?q=${encodeURIComponent(q)}&surface=${surface}&field=${fieldSlug}&sort=${sort}&offset=${Math.max(0, offset - limit)}&limit=${limit}`}
                  className="btn btn-sm"
                >
                  Previous
                </Link>
              )}
              {offset + limit < total && (
                <Link
                  href={`/techniques?q=${encodeURIComponent(q)}&surface=${surface}&field=${fieldSlug}&sort=${sort}&offset=${offset + limit}&limit=${limit}`}
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
