import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { config } from '@/lib/config';
import { syncPath } from '@/lib/services/github';
import { handleApiError } from '@/lib/errors';

function verifyGithubSignature(payload: string, signature: string | undefined, secret: string): boolean {
  if (!signature || !secret) return false;

  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const body = JSON.parse(rawBody);
    const signature = request.headers.get('x-hub-signature-256') || undefined;

    if (config.github.webhookSecret) {
      if (!verifyGithubSignature(rawBody, signature, config.github.webhookSecret)) {
        return NextResponse.json(
          { error: { code: 'INVALID_SIGNATURE', message: 'Webhook signature verification failed' } },
          { status: 401 }
        );
      }
    }

    const event = request.headers.get('x-github-event');

    if (event !== 'push') {
      return NextResponse.json({ message: 'Event ignored', event });
    }

    const commitSha = body.after as string;
    const commits = body.commits as Array<{
      added: string[];
      modified: string[];
      removed: string[];
    }>;

    if (!commits || !Array.isArray(commits)) {
      return NextResponse.json({ message: 'No commits in payload' });
    }

    // Collect all changed markdown files
    const changedPaths = new Set<string>();
    for (const commit of commits) {
      for (const p of [...(commit.added || []), ...(commit.modified || [])]) {
        if (p.endsWith('.md')) {
          changedPaths.add(p);
        }
      }
    }

    // Re-index changed files
    const results: string[] = [];
    for (const p of changedPaths) {
      try {
        await syncPath(p, commitSha);
        results.push(p);
      } catch (err) {
        results.push(`${p}: error - ${(err as Error).message}`);
      }
    }

    return NextResponse.json({
      message: 'Webhook processed',
      synced: results.length,
      paths: results,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
