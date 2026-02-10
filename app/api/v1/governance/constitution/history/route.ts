import { NextResponse } from 'next/server';
import { getAmendmentHistory } from '@/lib/services/governance';
import { handleApiError, wrapResponse } from '@/lib/errors';

export async function GET() {
  try {
    const amendments = await getAmendmentHistory();
    return NextResponse.json(wrapResponse(amendments));
  } catch (err) {
    return handleApiError(err);
  }
}
