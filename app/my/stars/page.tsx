import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { pool } from '@/lib/db/pool';
import * as starsService from '@/lib/services/stars';
import type { TechniqueEvidenceSummary } from '@/lib/types';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'My Stars' };

export default async function MyStarsPage() {
  const user = await requireUser();

  const starredTechniques = await starsService.getStarredTechniques(user.id);

  let techniqueList: TechniqueEvidenceSummary[] = [];
  if (starredTechniques.length > 0) {
    const ids = starredTechniques.map((s) => s.techniqueId);
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
    const { rows } = await pool.query<TechniqueEvidenceSummary>(
      `SELECT * FROM technique_evidence_summary WHERE id IN (${placeholders})`,
      ids
    );
    techniqueList = rows;
  }

  return (
    <>
      <h1>My Stars</h1>

      {techniqueList.length === 0 ? (
        <div className="empty-state">
          <p>You haven&apos;t starred any techniques yet.</p>
          <Link href="/techniques" className="btn">Browse Techniques</Link>
        </div>
      ) : (
        techniqueList.map((t) => (
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
              <span className="evidence-count">{t.critique_count} critiques</span>
              <span className="evidence-count">{t.star_count} stars</span>
            </div>
          </div>
        ))
      )}
    </>
  );
}
