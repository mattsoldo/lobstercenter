import { NextRequest, NextResponse } from 'next/server';
import { createEntry } from '@/lib/services/journal';
import { verifySignatureFromBody } from '@/lib/middleware/verify-signature';
import { handleApiError, wrapResponse } from '@/lib/errors';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const author = await verifySignatureFromBody(body);

    const entry = await createEntry({
      author,
      type: 'comparative-report',
      title: `Comparative Report`,
      body: body.methodology,
      structured_data: {
        results: body.results,
        recommendation: body.recommendation,
      },
      technique_ids: body.technique_ids,
      signature: body.signature,
    });
    return NextResponse.json(wrapResponse(entry), { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
