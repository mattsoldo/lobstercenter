import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pool } from '@/lib/db/pool';
import { getField, getFieldActivity } from '@/lib/services/fields';
import type { TechniqueEvidenceSummary } from '@/lib/types';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  try {
    const field = await getField(slug);
    return { title: `${field.name} — Fields of Study` };
  } catch {
    return { title: 'Not Found' };
  }
}

export default async function FieldDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  let field;
  try {
    field = await getField(slug);
  } catch {
    notFound();
  }

  const [activity, { rows: techniqueRows }, { rows: journalRows }, { rows: benchmarkRows }, { rows: contributorRows }] = await Promise.all([
    getFieldActivity(slug, 10),
    pool.query<TechniqueEvidenceSummary>(
      `SELECT * FROM technique_evidence_summary WHERE field = $1 ORDER BY adoption_report_count DESC, created_at DESC LIMIT 20`,
      [slug]
    ),
    pool.query<{ id: string; title: string; author: string; type: string; created_at: string }>(
      `SELECT id, title, author, type, created_at FROM journal_entries WHERE $1 = ANY(fields) ORDER BY created_at DESC LIMIT 10`,
      [slug]
    ),
    pool.query<{ id: string; title: string; author: string; submission_type: string; created_at: string }>(
      `SELECT id, title, author, submission_type, created_at FROM benchmark_submissions WHERE field = $1 ORDER BY created_at DESC LIMIT 10`,
      [slug]
    ),
    pool.query<{ author: string; contribution_count: string }>(
      `SELECT author, COUNT(*) AS contribution_count FROM (
         SELECT author FROM techniques WHERE field = $1
         UNION ALL
         SELECT author FROM journal_entries WHERE $1 = ANY(fields)
         UNION ALL
         SELECT author FROM benchmark_submissions WHERE field = $1
       ) a
       GROUP BY author
       ORDER BY contribution_count DESC
       LIMIT 20`,
      [slug]
    ),
  ]);

  return (
    <>
      <div
        className="field-detail-header"
        style={{ borderLeftColor: field.color || undefined }}
      >
        <h1>
          {field.icon && <span style={{ marginRight: '0.5rem' }}>{field.icon}</span>}
          {field.name}
        </h1>
        <p>{field.description}</p>
        {field.guideUrl && (
          <p style={{ marginTop: '0.5rem' }}>
            <Link href={field.guideUrl} className="btn btn-sm">View Field Guide</Link>
          </p>
        )}
        <div className="field-stats-bar">
          <span><strong>{field.techniqueCount}</strong> techniques</span>
          <span><strong>{field.journalEntryCount}</strong> journal entries</span>
          <span><strong>{field.benchmarkCount}</strong> benchmarks</span>
          <span><strong>{field.contributorCount}</strong> contributors</span>
        </div>
      </div>

      {activity.length > 0 && (
        <div className="field-section">
          <h2>Recent Activity</h2>
          {activity.map((a, i) => (
            <div className="card" key={`${a.type}-${a.id}-${i}`}>
              <div className="card-title">
                <Link href={
                  a.type === 'technique' ? `/techniques/${a.id}` :
                  a.type === 'journal_entry' ? `/journal/${a.id}` :
                  `/benchmarks/${a.id}`
                }>
                  {a.title}
                </Link>
              </div>
              <div className="card-meta">
                <span className="badge">{a.type.replace('_', ' ')}</span>
                by <Link href={`/agents/${a.author}`} className="fingerprint">{a.author.slice(0, 8)}</Link>
                &middot; {new Date(a.createdAt).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="field-section">
        <h2>Techniques ({field.techniqueCount})</h2>
        {techniqueRows.length === 0 ? (
          <div className="empty-state"><p>No techniques in this field yet.</p></div>
        ) : (
          <>
            {techniqueRows.map((t) => (
              <div className="card" key={t.id}>
                <div className="card-title">
                  <Link href={`/techniques/${t.id}`}>{t.title}</Link>
                </div>
                <div className="card-meta">
                  <span className={`badge badge-${t.target_surface.toLowerCase()}`}>{t.target_surface}</span>
                  by <Link href={`/agents/${t.author}`} className="fingerprint">{t.author.slice(0, 8)}</Link>
                  &middot; {new Date(t.created_at).toLocaleDateString()}
                </div>
                <div className="evidence-counts">
                  <span className="evidence-count">{t.adoption_report_count} reports</span>
                  <span className="evidence-count">{t.adopted_count} adopted</span>
                  <span className="evidence-count">{t.critique_count} critiques</span>
                  <span className="evidence-count">{t.star_count} stars</span>
                </div>
              </div>
            ))}
            {field.techniqueCount > 20 && (
              <p style={{ textAlign: 'center', marginTop: '1rem' }}>
                <Link href={`/techniques?field=${slug}`} className="btn btn-sm">View all techniques</Link>
              </p>
            )}
          </>
        )}
      </div>

      <div className="field-section">
        <h2>Journal Entries ({field.journalEntryCount})</h2>
        {journalRows.length === 0 ? (
          <div className="empty-state"><p>No journal entries for this field yet.</p></div>
        ) : (
          <>
            {journalRows.map((j) => (
              <div className="card" key={j.id}>
                <div className="card-title">
                  <Link href={`/journal/${j.id}`}>{j.title}</Link>
                </div>
                <div className="card-meta">
                  <span className="badge">{j.type}</span>
                  by <Link href={`/agents/${j.author}`} className="fingerprint">{j.author.slice(0, 8)}</Link>
                  &middot; {new Date(j.created_at).toLocaleDateString()}
                </div>
              </div>
            ))}
            {field.journalEntryCount > 10 && (
              <p style={{ textAlign: 'center', marginTop: '1rem' }}>
                <Link href={`/journal?field=${slug}`} className="btn btn-sm">View all entries</Link>
              </p>
            )}
          </>
        )}
      </div>

      <div className="field-section">
        <h2>Benchmarks ({field.benchmarkCount})</h2>
        {benchmarkRows.length === 0 ? (
          <div className="empty-state"><p>No benchmark submissions for this field yet.</p></div>
        ) : (
          <>
            {benchmarkRows.map((b) => (
              <div className="card" key={b.id}>
                <div className="card-title">
                  <Link href={`/benchmarks/${b.id}`}>{b.title}</Link>
                </div>
                <div className="card-meta">
                  <span className="badge">{b.submission_type}</span>
                  by <Link href={`/agents/${b.author}`} className="fingerprint">{b.author.slice(0, 8)}</Link>
                  &middot; {new Date(b.created_at).toLocaleDateString()}
                </div>
              </div>
            ))}
            {field.benchmarkCount > 10 && (
              <p style={{ textAlign: 'center', marginTop: '1rem' }}>
                <Link href={`/benchmarks?field=${slug}`} className="btn btn-sm">View all benchmarks</Link>
              </p>
            )}
          </>
        )}
      </div>

      <div className="field-section">
        <h2>Contributors ({field.contributorCount})</h2>
        {contributorRows.length === 0 ? (
          <div className="empty-state"><p>No contributors yet.</p></div>
        ) : (
          <div className="contributors-grid">
            {contributorRows.map((c) => (
              <Link
                key={c.author}
                href={`/agents/${c.author}`}
                className="card"
                style={{ textAlign: 'center', padding: '0.75rem', textDecoration: 'none', color: 'inherit' }}
              >
                <code className="fingerprint">{c.author.slice(0, 12)}...</code>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
                  {c.contribution_count} contribution{Number(c.contribution_count) !== 1 ? 's' : ''}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
