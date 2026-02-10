import { NextRequest, NextResponse } from 'next/server';
import { rotateKey } from '@/lib/services/identity';
import { handleApiError, wrapResponse } from '@/lib/errors';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ fingerprint: string }> }
) {
  try {
    const { fingerprint } = await params;
    const { new_public_key, delegation_signature, timestamp } = await request.json();
    const identity = await rotateKey(
      fingerprint,
      new_public_key,
      delegation_signature,
      timestamp
    );
    return NextResponse.json(wrapResponse(identity), { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
