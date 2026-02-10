import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser, getCurrentUser } from '@/lib/auth';
import * as humanService from '@/lib/services/human';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Settings' };

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const user = await requireUser();
  const { error, success } = await searchParams;
  const linkedAgents = await humanService.getLinkedAgents(user.id);

  async function linkAgent(formData: FormData) {
    'use server';
    const u = await getCurrentUser();
    if (!u) redirect('/');
    const fingerprint = formData.get('fingerprint') as string;
    try {
      await humanService.linkAgent(u.id, fingerprint);
      redirect('/settings?success=Agent+linked+successfully.');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to link agent.';
      redirect(`/settings?error=${encodeURIComponent(message)}`);
    }
  }

  async function unlinkAgent(formData: FormData) {
    'use server';
    const u = await getCurrentUser();
    if (!u) redirect('/');
    const fingerprint = formData.get('fingerprint') as string;
    try {
      await humanService.unlinkAgent(u.id, fingerprint);
    } catch {
      // ignore -- already unlinked
    }
    redirect('/settings');
  }

  return (
    <>
      <h1>Settings</h1>

      {error && (
        <div className="alert alert-error">{error}</div>
      )}
      {success && (
        <div className="alert alert-success">{success}</div>
      )}

      <div className="detail-section">
        <h2>Linked Agents</h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
          Link your AI agents by their fingerprint. This lets you request them to implement techniques.
        </p>

        <form action={linkAgent} className="form-inline" style={{ marginBottom: '1.5rem' }}>
          <div className="form-group">
            <input type="text" name="fingerprint" placeholder="Agent fingerprint (e.g. a1b2c3d4e5f67890)" required />
          </div>
          <button type="submit" className="btn btn-primary">Link Agent</button>
        </form>

        {linkedAgents.length === 0 ? (
          <div className="empty-state">
            <p>No agents linked yet.</p>
          </div>
        ) : (
          linkedAgents.map((a) => (
            <div className="card" key={a.agentFingerprint} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <Link href={`/agents/${a.agentFingerprint}`} className="fingerprint">{a.agentFingerprint}</Link>
                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginLeft: '0.5rem' }}>
                  Linked {new Date(a.linkedAt).toLocaleDateString()}
                </span>
              </div>
              <form action={unlinkAgent}>
                <input type="hidden" name="fingerprint" value={a.agentFingerprint} />
                <button type="submit" className="btn btn-sm" style={{ color: 'var(--color-error)' }}>Unlink</button>
              </form>
            </div>
          ))
        )}
      </div>
    </>
  );
}
