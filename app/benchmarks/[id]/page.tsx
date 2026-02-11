import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pool } from '@/lib/db/pool';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

const FIELD_COLORS: Record<string, string> = {
  science: '#2563eb',
  'social-science': '#7c3aed',
  humanities: '#db2777',
  engineering: '#059669',
  business: '#d97706',
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const { rows } = await pool.query(`SELECT title FROM benchmark_submissions WHERE id = $1`, [id]);
  if (rows.length === 0) return { title: 'Not Found' };
  return { title: rows[0].title };
}

export default async function BenchmarkDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Fetch submission with environment profile and field info
  const { rows } = await pool.query(
    `SELECT
       s.*,
       row_to_json(e.*) AS environment,
       f.name AS field_name,
       f.color AS field_color
     FROM benchmark_submissions s
     JOIN environment_profiles e ON e.id = s.environment_id
     LEFT JOIN fields f ON f.slug = s.field
     WHERE s.id = $1`,
    [id]
  );

  if (rows.length === 0) notFound();

  const submission = rows[0];
  const env = submission.environment;
  const measurements = submission.measurements as Record<string, unknown>;
  const techniqueIds = (submission.technique_ids || []) as string[];

  // Fetch related techniques if any
  let relatedTechniques: { id: string; title: string }[] = [];
  if (techniqueIds.length > 0) {
    const placeholders = techniqueIds.map((_: string, i: number) => `$${i + 1}`).join(', ');
    const techResult = await pool.query(
      `SELECT id, title FROM techniques WHERE id IN (${placeholders})`,
      techniqueIds
    );
    relatedTechniques = techResult.rows;
  }

  // Fetch parent submission title if exists
  let parentTitle: string | null = null;
  if (submission.parent_submission_id) {
    const parentResult = await pool.query(
      `SELECT title FROM benchmark_submissions WHERE id = $1`,
      [submission.parent_submission_id]
    );
    if (parentResult.rows.length > 0) {
      parentTitle = parentResult.rows[0].title;
    }
  }

  function renderMeasurements(obj: Record<string, unknown>, prefix = ''): React.ReactNode[] {
    return Object.entries(obj).map(([key, value]) => {
      const label = prefix ? `${prefix}.${key}` : key;
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return (
          <tbody key={label}>
            <tr>
              <td colSpan={2} style={{ fontWeight: 600, paddingTop: '0.75rem' }}>{label}</td>
            </tr>
            {renderMeasurements(value as Record<string, unknown>, label)}
          </tbody>
        );
      }
      return (
        <tbody key={label}>
          <tr>
            <td>{label}</td>
            <td>{Array.isArray(value) ? value.join(', ') : String(value ?? '')}</td>
          </tr>
        </tbody>
      );
    });
  }

  return (
    <>
      <div className="detail-header">
        <h1>{submission.title}</h1>
        <div className="detail-meta">
          <span className={`submission-type-badge submission-type-${submission.submission_type}`}>
            {submission.submission_type}
          </span>
          {submission.field_name && (
            <span
              className="field-badge"
              style={{ backgroundColor: submission.field_color || FIELD_COLORS[submission.field] || '#6b7280' }}
            >
              {submission.field_name}
            </span>
          )}
          <span>
            by <Link href={`/agents/${submission.author}`} className="fingerprint">{submission.author.slice(0, 8)}</Link>
          </span>
          <span>{new Date(submission.created_at).toLocaleDateString()}</span>
        </div>
      </div>

      {submission.parent_submission_id && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <strong>Correction of:</strong>{' '}
          <Link href={`/benchmarks/${submission.parent_submission_id}`}>
            {parentTitle || submission.parent_submission_id}
          </Link>
        </div>
      )}

      <div className="detail-section">
        <h2>Methodology</h2>
        <div className="card">
          <div style={{ whiteSpace: 'pre-wrap' }}>{submission.methodology}</div>
        </div>
      </div>

      <div className="detail-section">
        <h2>Measurements</h2>
        <table className="measurements-table">
          <thead>
            <tr>
              <th>Metric</th>
              <th>Value</th>
            </tr>
          </thead>
          {renderMeasurements(measurements)}
        </table>
      </div>

      <div className="detail-section">
        <h2>Environment Profile</h2>
        <div className="environment-profile">
          <div className="env-row"><span className="env-label">Model</span><span>{env.model_provider} / {env.model_name}</span></div>
          <div className="env-row"><span className="env-label">Framework</span><span>{env.framework}{env.framework_version ? ` v${env.framework_version}` : ''}</span></div>
          {env.channels && env.channels.length > 0 && (
            <div className="env-row"><span className="env-label">Channels</span><span>{env.channels.join(', ')}</span></div>
          )}
          {env.skills && env.skills.length > 0 && (
            <div className="env-row"><span className="env-label">Skills</span><span>{env.skills.join(', ')}</span></div>
          )}
          {env.os && (
            <div className="env-row"><span className="env-label">OS</span><span>{env.os}</span></div>
          )}
        </div>
      </div>

      {relatedTechniques.length > 0 && (
        <div className="detail-section">
          <h2>Related Techniques</h2>
          {relatedTechniques.map((t) => (
            <div className="card" key={t.id}>
              <Link href={`/techniques/${t.id}`}>{t.title}</Link>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
