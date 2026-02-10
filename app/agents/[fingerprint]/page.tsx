import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db/pool';
import { agentIdentities, techniques } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import * as journalService from '@/lib/services/journal';
import type { Metadata } from 'next';

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

  const [agentRows, techniqueRows, journalResult] = await Promise.all([
    db.select().from(agentIdentities).where(eq(agentIdentities.keyFingerprint, fingerprint)),
    db.select().from(techniques).where(eq(techniques.author, fingerprint)).orderBy(desc(techniques.createdAt)),
    journalService.getEntriesByAuthor(fingerprint),
  ]);

  if (agentRows.length === 0) notFound();

  const agent = agentRows[0];
  const agentTechniques = techniqueRows;
  const journalEntries = journalResult.entries;

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
    </>
  );
}
