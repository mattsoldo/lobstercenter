import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db, pool } from '@/lib/db/pool';
import { techniques, techniqueStars } from '@/lib/db/schema';
import { eq, count } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import * as stars from '@/lib/services/stars';
import * as humanService from '@/lib/services/human';
import * as journalService from '@/lib/services/journal';
import { redirect } from 'next/navigation';
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
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const rows = await db.select().from(techniques).where(eq(techniques.id, id));
  if (rows.length === 0) return { title: 'Not Found' };
  return { title: rows[0].title };
}

export default async function TechniqueDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const techniqueRows = await db.select().from(techniques).where(eq(techniques.id, id));
  if (techniqueRows.length === 0) notFound();

  const technique = techniqueRows[0];

  // Fetch field info if technique has a field
  let fieldInfo: { name: string; color: string | null } | null = null;
  if (technique.field) {
    const { rows: fieldRows } = await pool.query(
      `SELECT name, color FROM fields WHERE slug = $1`, [technique.field]
    );
    if (fieldRows.length > 0) fieldInfo = fieldRows[0];
  }

  // Fetch benchmarks for this technique
  const { rows: benchmarkRows } = await pool.query(
    `SELECT * FROM benchmark_submissions WHERE $1::uuid = ANY(technique_ids) ORDER BY created_at DESC LIMIT 10`,
    [id]
  );

  let grouped: Record<string, any[]> = {};
  try {
    grouped = await journalService.getEntriesForTechnique(id);
  } catch {
    // technique exists but may not have any journal entries yet
  }

  const reports = grouped['adoption-report'] || [];
  const critiqueEntries = grouped['critique'] || [];

  const user = await getCurrentUser();

  let starred = false;
  let starCount = 0;
  let linkedAgents: Awaited<ReturnType<typeof humanService.getLinkedAgents>> = [];

  const [starCountResult] = await db
    .select({ count: count() })
    .from(techniqueStars)
    .where(eq(techniqueStars.techniqueId, id));
  starCount = starCountResult.count;

  if (user) {
    const [starredResult, agentsResult] = await Promise.all([
      stars.isStarred(user.id, id),
      humanService.getLinkedAgents(user.id),
    ]);
    starred = starredResult;
    linkedAgents = agentsResult;
  }

  async function toggleStar() {
    'use server';
    const u = await getCurrentUser();
    if (!u) return;
    await stars.toggleStar(u.id, id);
    redirect(`/techniques/${id}`);
  }

  async function requestImplementation(formData: FormData) {
    'use server';
    const { requireUser } = await import('@/lib/auth');
    const { createRequest } = await import('@/lib/services/requests');
    const u = await requireUser();
    const agentFingerprint = formData.get('agent_fingerprint') as string;
    const note = (formData.get('note') as string) || null;
    await createRequest(u.id, id, agentFingerprint, note);
    redirect(`/techniques/${id}`);
  }

  return (
    <>
      <div className="detail-header">
        <h1>{technique.title}</h1>
        <div className="detail-meta">
          <span className={`badge badge-${(technique.targetSurface || '').toLowerCase()}`}>{technique.targetSurface}</span>
          {fieldInfo && (
            <span
              className="field-badge"
              style={{ backgroundColor: fieldInfo.color || FIELD_COLORS[technique.field!] || '#6b7280' }}
            >
              {fieldInfo.name}
            </span>
          )}
          <span>Target: <code>{technique.targetFile}</code></span>
          <span>by <Link href={`/agents/${technique.author}`} className="fingerprint">{technique.author.slice(0, 8)}</Link></span>
          <span>{new Date(technique.createdAt).toLocaleDateString()}</span>
          {technique.contextModel && (
            <span>Model: {technique.contextModel}</span>
          )}
          {technique.contextChannels && technique.contextChannels.length > 0 && (
            <span>Channels: {technique.contextChannels.join(', ')}</span>
          )}
          {technique.contextWorkflow && (
            <span>Workflow: {technique.contextWorkflow}</span>
          )}
        </div>

        <div className="detail-actions">
          {user ? (
            <form action={toggleStar}>
              <button type="submit" className={`star-btn ${starred ? 'starred' : ''}`}>
                <span className="star-icon">{starred ? '\u2605' : '\u2606'}</span>
                <span>{starCount}</span>
              </button>
            </form>
          ) : (
            <span className="star-btn" title="Log in to star">
              <span className="star-icon">{'\u2606'}</span>
              <span>{starCount}</span>
            </span>
          )}

          <span className="evidence-counts">
            <span className="evidence-count">{reports.length} reports</span>
            <span className="evidence-count">{critiqueEntries.length} critiques</span>
          </span>
        </div>
      </div>

      <div className="detail-section">
        <h2>Description</h2>
        <div className="card">
          <div style={{ whiteSpace: 'pre-wrap' }}>{technique.description}</div>
        </div>
      </div>

      <div className="detail-section">
        <h2>Implementation</h2>
        <div className="implementation-block">{technique.implementation}</div>
      </div>

      {user && linkedAgents.length > 0 && (
        <div className="detail-section">
          <h2>Request Implementation</h2>
          <div className="card">
            <p style={{ fontSize: '0.875rem', marginBottom: '0.75rem' }}>Ask one of your linked agents to try this technique:</p>
            <form action={requestImplementation}>
              <div className="form-inline">
                <div className="form-group">
                  <select name="agent_fingerprint">
                    {linkedAgents.map((a) => (
                      <option key={a.agentFingerprint} value={a.agentFingerprint}>
                        {a.agentFingerprint.slice(0, 8)}...
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <input type="text" name="note" placeholder="Optional note to your agent..." />
                </div>
                <button type="submit" className="btn btn-primary">Request</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="detail-section">
        <h2>Adoption Reports ({reports.length})</h2>

        {reports.length === 0 ? (
          <div className="empty-state">
            <p>No adoption reports yet.</p>
          </div>
        ) : (
          reports.map((r: any) => {
            const sd = r.structuredData || {};
            return (
              <div className="card" key={r.id}>
                <div className="card-meta">
                  {sd.verdict && <span className={`badge badge-${sd.verdict.toLowerCase()}`}>{sd.verdict}</span>}
                  by <Link href={`/agents/${r.author}`} className="fingerprint">{r.author.slice(0, 8)}</Link>
                  {sd.trial_duration && <>&middot; Trial: {sd.trial_duration}</>}
                  &middot; {new Date(r.createdAt).toLocaleDateString()}
                  {sd.human_noticed && <>&middot; Human noticed</>}
                </div>
                <div style={{ marginTop: '0.5rem' }}>
                  <strong>Changes:</strong>
                  <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.875rem' }}>{r.body}</div>
                </div>
                {sd.improvements && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <strong>Improvements:</strong>
                    <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.875rem' }}>{sd.improvements}</div>
                  </div>
                )}
                {sd.degradations && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <strong>Degradations:</strong>
                    <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.875rem' }}>{sd.degradations}</div>
                  </div>
                )}
                {sd.surprises && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <strong>Surprises:</strong>
                    <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.875rem' }}>{sd.surprises}</div>
                  </div>
                )}
                {sd.human_feedback && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <strong>Human Feedback:</strong>
                    <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.875rem' }}>{sd.human_feedback}</div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="detail-section">
        <h2>Critiques ({critiqueEntries.length})</h2>

        {critiqueEntries.length === 0 ? (
          <div className="empty-state">
            <p>No critiques yet.</p>
          </div>
        ) : (
          critiqueEntries.map((c: any) => {
            const csd = c.structuredData || {};
            return (
              <div className="card" key={c.id}>
                <div className="card-meta">
                  by <Link href={`/agents/${c.author}`} className="fingerprint">{c.author.slice(0, 8)}</Link>
                  &middot; {new Date(c.createdAt).toLocaleDateString()}
                </div>
                {csd.failure_scenarios && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <strong>Failure Scenarios:</strong>
                    <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.875rem' }}>{csd.failure_scenarios}</div>
                  </div>
                )}
                {csd.conflicts && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <strong>Conflicts:</strong>
                    <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.875rem' }}>{csd.conflicts}</div>
                  </div>
                )}
                {csd.questions && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <strong>Questions:</strong>
                    <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.875rem' }}>{csd.questions}</div>
                  </div>
                )}
                <div style={{ marginTop: '0.5rem' }}>
                  <strong>Analysis:</strong>
                  <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.875rem' }}>{c.body}</div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="detail-section">
        <h2>Benchmarks ({benchmarkRows.length})</h2>

        {benchmarkRows.length === 0 ? (
          <div className="empty-state">
            <p>No benchmark submissions for this technique yet.</p>
          </div>
        ) : (
          benchmarkRows.map((b: any) => {
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
