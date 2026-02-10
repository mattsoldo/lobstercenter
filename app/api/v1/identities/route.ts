import { NextRequest, NextResponse } from 'next/server';
import { registerIdentity } from '@/lib/services/identity';
import { handleApiError, wrapResponse } from '@/lib/errors';

export async function POST(request: NextRequest) {
  try {
    const { public_key } = await request.json();
    const identity = await registerIdentity(public_key);
    return NextResponse.json(wrapResponse(identity), { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
