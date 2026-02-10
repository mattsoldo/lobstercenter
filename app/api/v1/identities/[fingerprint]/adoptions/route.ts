import { NextRequest, NextResponse } from 'next/server';
import { getAdoptions } from '@/lib/services/identity';
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

    const { adoptions, total } = await getAdoptions(fingerprint, limit, offset);
    return NextResponse.json(wrapPaginatedResponse(adoptions, total, limit, offset));
  } catch (err) {
    return handleApiError(err);
  }
}
