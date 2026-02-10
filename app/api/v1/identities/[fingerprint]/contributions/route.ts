import { NextRequest, NextResponse } from 'next/server';
import { getContributions } from '@/lib/services/identity';
import { handleApiError, wrapPaginatedResponse } from '@/lib/errors';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fingerprint: string }> }
) {
  try {
    const { fingerprint } = await params;
    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0'), 0);

    const { contributions, total } = await getContributions(fingerprint, limit, offset);
    return NextResponse.json(wrapPaginatedResponse(contributions, total, limit, offset));
  } catch (err) {
    return handleApiError(err);
  }
}
