import { NextRequest, NextResponse } from 'next/server';
import { getSubmission } from '@/lib/services/benchmarks';
import { handleApiError, wrapResponse } from '@/lib/errors';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const submission = await getSubmission(id);
    return NextResponse.json(wrapResponse(submission));
  } catch (err) {
    return handleApiError(err);
  }
}
