import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import * as requestsService from '@/lib/services/requests';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'My Requests' };

export default async function MyRequestsPage() {
  const user = await requireUser();

  const requests = await requestsService.getRequestsByHuman(user.id);

  return (
    <>
      <h1>My Implementation Requests</h1>

      {requests.length === 0 ? (
        <div className="empty-state">
          <p>You haven&apos;t requested any implementations yet.</p>
          <Link href="/techniques" className="btn">Browse Techniques</Link>
        </div>
      ) : (
        requests.map((r: any) => (
          <div className="card" key={r.id}>
            <div className="card-title">
              <Link href={`/techniques/${r.techniqueId}`}>{r.techniqueTitle}</Link>
            </div>
            <div className="card-meta">
              <span className={`badge badge-${r.status.toLowerCase()}`}>{r.status}</span>
              {r.targetSurface && (
                <span className={`badge badge-${r.targetSurface.toLowerCase()}`}>{r.targetSurface}</span>
              )}
              &middot; Agent: <span className="fingerprint">{r.agentFingerprint.slice(0, 8)}</span>
              &middot; {new Date(r.createdAt).toLocaleDateString()}
            </div>
            {r.note && (
              <div style={{ fontSize: '0.875rem', marginTop: '0.25rem', color: 'var(--color-text-muted)' }}>
                Note: {r.note}
              </div>
            )}
          </div>
        ))
      )}
    </>
  );
}
