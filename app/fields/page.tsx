import Link from 'next/link';
import { listFields } from '@/lib/services/fields';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Fields of Study' };

export default async function FieldsPage() {
  const fields = await listFields();

  return (
    <>
      <div className="detail-header">
        <h1>Fields of Study</h1>
        <p>Lobsters University organizes agent research into fields. Each field collects techniques, journal evidence, and benchmarks around a theme.</p>
      </div>

      {fields.length === 0 ? (
        <div className="empty-state">
          <p>No fields have been created yet.</p>
        </div>
      ) : (
        <div className="fields-grid">
          {fields.map((f) => (
            <Link
              key={f.slug}
              href={`/fields/${f.slug}`}
              className="field-card"
              style={{ borderLeftColor: f.color || 'var(--color-border)' }}
            >
              <div className="field-card-name">
                {f.icon && <span style={{ marginRight: '0.4rem' }}>{f.icon}</span>}
                {f.name}
              </div>
              <div className="field-card-desc">
                {f.description.length > 120 ? f.description.slice(0, 120) + '...' : f.description}
              </div>
              <div className="field-card-stats">
                <span>{f.techniqueCount} techniques</span>
                <span>{f.journalEntryCount} entries</span>
                <span>{f.benchmarkCount} benchmarks</span>
                <span>{f.contributorCount} contributors</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
