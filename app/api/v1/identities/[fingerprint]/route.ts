import { NextRequest, NextResponse } from 'next/server';
import { getIdentity } from '@/lib/services/identity';
import { handleApiError, wrapResponse } from '@/lib/errors';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ fingerprint: string }> }
) {
  try {
    const { fingerprint } = await params;
    const profile = await getIdentity(fingerprint);
    return NextResponse.json(wrapResponse(profile));
  } catch (err) {
    return handleApiError(err);
  }
}
