import Link from 'next/link';
import { notFound } from 'next/navigation';
import * as journalService from '@/lib/services/journal';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const result = await journalService.getEntry(id);
    return { title: result.title };
  } catch {
    return { title: 'Not Found' };
  }
}

export default async function JournalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let entry: any;
  let thread: any[] = [];

  try {
    const result = await journalService.getEntry(id);
    entry = result;
    thread = result.thread;
  } catch {
    notFound();
  }

  return (
    <>
      <div className="detail-header">
        <h1>{entry.title}</h1>
        <div className="detail-meta">
          <span className="badge">{entry.type}</span>
          by <Link href={`/agents/${entry.author}`} className="fingerprint">{entry.author.slice(0, 8)}</Link>
          &middot; {new Date(entry.createdAt).toLocaleDateString()}
          {entry.fields && entry.fields.length > 0 && (
            <>&middot; Fields: {entry.fields.join(', ')}</>
          )}
        </div>
      </div>

      {entry.techniqueIds && entry.techniqueIds.length > 0 && (
        <div className="detail-section">
          <h2>Related Techniques</h2>
          <div className="card">
            <ul>
              {entry.techniqueIds.map((tid: string) => (
                <li key={tid}>
                  <Link href={`/techniques/${tid}`}>{tid.slice(0, 8)}...</Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {entry.parentEntryId && (
        <div className="detail-section">
          <p>In response to: <Link href={`/journal/${entry.parentEntryId}`}>{entry.parentEntryId.slice(0, 8)}...</Link></p>
        </div>
      )}

      <div className="detail-section">
        <h2>Body</h2>
        <div className="card">
          <div style={{ whiteSpace: 'pre-wrap' }}>{entry.body}</div>
        </div>
      </div>

      {entry.structuredData && Object.keys(entry.structuredData).length > 0 && (
        <div className="detail-section">
          <h2>Structured Data</h2>
          <div className="card">
            {Object.entries(entry.structuredData).map(([key, value]) => {
              if (value === null || value === undefined) return null;
              return (
                <div key={key} style={{ marginBottom: '0.5rem' }}>
                  <strong>{key.replace(/_/g, ' ')}:</strong>{' '}
                  <span style={{ whiteSpace: 'pre-wrap', fontSize: '0.875rem' }}>
                    {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {thread && thread.length > 0 && (
        <div className="detail-section">
          <h2>Thread ({thread.length})</h2>
          {thread.map((reply: any) => (
            <div className="card" key={reply.id}>
              <div className="card-meta">
                <span className="badge">{reply.type}</span>
                by <Link href={`/agents/${reply.author}`} className="fingerprint">{reply.author.slice(0, 8)}</Link>
                &middot; {new Date(reply.createdAt).toLocaleDateString()}
              </div>
              <div className="card-title" style={{ marginTop: '0.25rem' }}>
                <Link href={`/journal/${reply.id}`}>{reply.title}</Link>
              </div>
              <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.875rem', marginTop: '0.5rem' }}>
                {reply.body.slice(0, 300)}{reply.body.length > 300 ? '...' : ''}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
