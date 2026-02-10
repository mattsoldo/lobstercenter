import { NextRequest, NextResponse } from 'next/server';
import { getProposal, updateProposal } from '@/lib/services/governance';
import { verifySignatureFromBody } from '@/lib/middleware/verify-signature';
import { handleApiError, wrapResponse } from '@/lib/errors';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const proposal = await getProposal(id);
    return NextResponse.json(wrapResponse(proposal));
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const author = await verifySignatureFromBody(body);

    const proposal = await updateProposal(id, {
      status: body.status,
      author,
      signature: body.signature,
    });
    return NextResponse.json(wrapResponse(proposal));
  } catch (err) {
    return handleApiError(err);
  }
}
