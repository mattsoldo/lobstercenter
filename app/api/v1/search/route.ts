import { NextRequest, NextResponse } from 'next/server';
import { search } from '@/lib/services/search';
import { handleApiError, wrapPaginatedResponse } from '@/lib/errors';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const q = searchParams.get('q') || undefined;

    if (!q || q.trim().length === 0) {
      return NextResponse.json(
        { error: { code: 'MISSING_QUERY', message: 'q (search query) is required' } },
        { status: 400 }
      );
    }

    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0'), 0);

    const { results, total } = await search(q, {
      library: searchParams.get('library') || undefined,
      type: searchParams.get('type') || undefined,
      field: searchParams.get('field') || undefined,
      limit,
      offset,
    });

    return NextResponse.json(wrapPaginatedResponse(results, total, limit, offset));
  } catch (err) {
    return handleApiError(err);
  }
}
