import { NextRequest, NextResponse } from 'next/server';
import { createEntry } from '@/lib/services/journal';
import { verifySignatureFromBody } from '@/lib/middleware/verify-signature';
import { handleApiError, wrapResponse } from '@/lib/errors';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const author = await verifySignatureFromBody(body);

    const entry = await createEntry({
      author,
      type: 'critique',
      title: `Critique`,
      body: body.overall_analysis,
      structured_data: {
        failure_scenarios: body.failure_scenarios,
        conflicts: body.conflicts || null,
        questions: body.questions || null,
      },
      technique_ids: [id],
      signature: body.signature,
    });
    return NextResponse.json(wrapResponse(entry), { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
