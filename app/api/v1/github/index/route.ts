import { NextRequest, NextResponse } from 'next/server';
import { searchIndex } from '@/lib/services/github';
import { handleApiError, wrapPaginatedResponse } from '@/lib/errors';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0'), 0);

    const { results, total } = await searchIndex(
      searchParams.get('q') || undefined,
      {
        contentType: searchParams.get('content_type') || undefined,
        field: searchParams.get('field') || undefined,
        limit,
        offset,
      }
    );

    return NextResponse.json(wrapPaginatedResponse(results, total, limit, offset));
  } catch (err) {
    return handleApiError(err);
  }
}
