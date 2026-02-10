import { NextRequest, NextResponse } from 'next/server';
import { getEntry } from '@/lib/services/journal';
import { handleApiError, wrapResponse } from '@/lib/errors';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const entry = await getEntry(id);
    return NextResponse.json(wrapResponse(entry));
  } catch (err) {
    return handleApiError(err);
  }
}
