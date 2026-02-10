import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/pool';
import { githubIndex } from '@/lib/db/schema';
import { handleApiError, wrapResponse } from '@/lib/errors';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params;
    const githubPath = path.join('/');

    if (!githubPath) {
      return NextResponse.json(
        { error: { code: 'MISSING_PATH', message: 'File path is required' } },
        { status: 400 }
      );
    }

    const rows = await db
      .select()
      .from(githubIndex)
      .where(eq(githubIndex.githubPath, githubPath));

    if (rows.length === 0) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: `No indexed file at path "${githubPath}"` } },
        { status: 404 }
      );
    }

    return NextResponse.json(wrapResponse(rows[0]));
  } catch (err) {
    return handleApiError(err);
  }
}
