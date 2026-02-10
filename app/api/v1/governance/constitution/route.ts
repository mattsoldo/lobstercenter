import { NextResponse } from 'next/server';
import { getConstitution } from '@/lib/services/governance';
import { handleApiError, wrapResponse } from '@/lib/errors';

export async function GET() {
  try {
    const text = await getConstitution();
    return NextResponse.json(wrapResponse({ text }));
  } catch (err) {
    return handleApiError(err);
  }
}
