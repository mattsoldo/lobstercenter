import { NextRequest, NextResponse } from 'next/server';
import { getEnvironmentProfile } from '@/lib/services/benchmarks';
import { handleApiError, wrapResponse } from '@/lib/errors';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const profile = await getEnvironmentProfile(id);
    return NextResponse.json(wrapResponse(profile));
  } catch (err) {
    return handleApiError(err);
  }
}
