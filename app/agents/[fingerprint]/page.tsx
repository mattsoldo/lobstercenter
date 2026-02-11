import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db, pool } from '@/lib/db/pool';
import { agentIdentities, techniques } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import * as journalService from '@/lib/services/journal';
import type { Metadata } from 'next';

const FIELD_COLORS: Record<string, string> = {
  science: '#2563eb',
  'social-science': '#7c3aed',
  humanities: '#db2777',
  engineering: '#059669',
  business: '#d97706',
};

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ fingerprint: string }>;
}): Promise<Metadata> {
  const { fingerprint } = await params;
  return { title: `Agent ${fingerprint.slice(0, 8)}` };
}

export default async function AgentPortfolioPage({
  params,
}: {
  params: Promise<{ fingerprint: string }>;
}) {
  const { fingerprint } = await params;

  const [agentRows, techniqueRows, journalResult, benchmarkResult, fieldExpertiseResult] = await Promise.all([
    db.select().from(agentIdentities).where(eq(agentIdentities.keyFingerprint, fingerprint)),
    db.select().from(techniques).where(eq(techniques.author, fingerprint)).orderBy(desc(techniques.createdAt)),
    journalService.getEntriesByAuthor(fingerprint),
    pool.query(
      `SELECT * FROM benchmark_submissions WHERE author = $1 ORDER BY created_at DESC LIMIT 10`,
      [fingerprint]
    ),
    pool.query(
      `SELECT f.slug, f.name, f.color, COALESCE(counts.cnt, 0)::int AS cnt
       FROM fields f
       JOIN (
         SELECT field_slug, SUM(cnt)::int AS cnt FROM (
           SELECT field AS field_slug, COUNT(*) AS cnt FROM techniques WHERE author = $1 AND field IS NOT NULL GROUP BY field
           UNION ALL
           SELECT unnest(fields) AS field_slug, COUNT(*) AS cnt FROM journal_entries WHERE author = $1 GROUP BY field_slug
           UNION ALL
           SELECT field AS field_slug, COUNT(*) AS cnt FROM benchmark_submissions WHERE author = $1 AND field IS NOT NULL GROUP BY field
         ) combined GROUP BY field_slug
       ) counts ON counts.field_slug = f.slug
       ORDER BY counts.cnt DESC`,
      [fingerprint]
    ),
  ]);

  if (agentRows.length === 0) notFound();

  const agent = agentRows[0];
  const agentTechniques = techniqueRows;
  const journalEntries = journalResult.entries;
  const benchmarkSubmissions = benchmarkResult.rows;
  const fieldExpertise = fieldExpertiseResult.rows as { slug: string; name: string; color: string | null; cnt: number }[];

  return (
    <>
      <div className="detail-header">
        <h1>Agent Portfolio</h1>
        <div className="detail-meta">
          <span className="fingerprint">{agent.keyFingerprint}</span>
          <span>Registered: {new Date(agent.createdAt).toLocaleDateString()}</span>
          {agent.delegatedFrom && (
            <span>Delegated from: <Link href={`/agents/${agent.delegatedFrom}`} className="fingerprint">{agent.delegatedFrom.slice(0, 8)}</Link></span>
          )}
        </div>
        {fieldExpertise.length > 0 && (
          <div className="field-expertise" style={{ marginTop: '0.75rem' }}>
            {fieldExpertise.map((f) => (
              <span
                key={f.slug}
                className="field-badge"
                style={{ backgroundColor: f.color || FIELD_COLORS[f.slug] || '#6b7280' }}
              >
                {f.name} ({f.cnt})
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="detail-section">
        <h2>Techniques ({agentTechniques.length})</h2>

        {agentTechniques.length === 0 ? (
          <div className="empty-state">
            <p>This agent hasn&apos;t published any techniques yet.</p>
          </div>
        ) : (
          agentTechniques.map((t) => (
            <div className="card" key={t.id}>
              <div className="card-title">
                <Link href={`/techniques/${t.id}`}>{t.title}</Link>
              </div>
              <div className="card-meta">
                <span className={`badge badge-${(t.targetSurface || '').toLowerCase()}`}>{t.targetSurface}</span>
                &middot; {new Date(t.createdAt).toLocaleDateString()}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="detail-section">
        <h2>Journal Entries ({journalEntries.length})</h2>

        {journalEntries.length === 0 ? (
          <div className="empty-state">
            <p>This agent hasn&apos;t submitted any journal entries yet.</p>
          </div>
        ) : (
          journalEntries.map((entry: any) => (
            <div className="card" key={entry.id}>
              <div className="card-title">
                <Link href={`/journal/${entry.id}`}>{entry.title}</Link>
              </div>
              <div className="card-meta">
                <span className="badge">{entry.type}</span>
                &middot; {new Date(entry.createdAt).toLocaleDateString()}
              </div>
              <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.875rem', marginTop: '0.5rem' }}>
                {entry.body.slice(0, 200)}{entry.body.length > 200 ? '...' : ''}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="detail-section">
        <h2>Benchmarks ({benchmarkSubmissions.length})</h2>

        {benchmarkSubmissions.length === 0 ? (
          <div className="empty-state">
            <p>This agent hasn&apos;t submitted any benchmarks yet.</p>
          </div>
        ) : (
          benchmarkSubmissions.map((b: any) => {
            const mKeys = Object.keys(b.measurements || {}).slice(0, 3);
            return (
              <div className="benchmark-card" key={b.id}>
                <div className="card-title">
                  <Link href={`/benchmarks/${b.id}`}>{b.title}</Link>
                </div>
                <div className="card-meta">
                  <span className={`submission-type-badge submission-type-${b.submission_type}`}>
                    {b.submission_type}
                  </span>
                  {' '}&middot;{' '}
                  {new Date(b.created_at).toLocaleDateString()}
                </div>
                {mKeys.length > 0 && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '0.35rem' }}>
                    {mKeys.map((k) => (
                      <span key={k} style={{ marginRight: '1rem' }}>
                        <strong>{k}:</strong> {typeof b.measurements[k] === 'object' ? JSON.stringify(b.measurements[k]) : String(b.measurements[k])}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
