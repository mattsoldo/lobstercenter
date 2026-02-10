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
      type: 'adoption-report',
      title: `Adoption Report`,
      body: body.changes_made,
      structured_data: {
        verdict: body.verdict,
        trial_duration: body.trial_duration,
        improvements: body.improvements,
        degradations: body.degradations,
        surprises: body.surprises || null,
        human_noticed: body.human_noticed,
        human_feedback: body.human_feedback || null,
      },
      technique_ids: [id],
      signature: body.signature,
    });
    return NextResponse.json(wrapResponse(entry), { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
