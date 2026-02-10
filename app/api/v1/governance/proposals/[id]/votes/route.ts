import { NextRequest, NextResponse } from 'next/server';
import { castVote, listVotes } from '@/lib/services/governance';
import { verifySignatureFromBody } from '@/lib/middleware/verify-signature';
import { handleApiError, wrapResponse } from '@/lib/errors';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const votes = await listVotes(id);
    return NextResponse.json(wrapResponse(votes));
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const author = await verifySignatureFromBody(body);

    const vote = await castVote(id, {
      author,
      vote: body.vote,
      rationale: body.rationale,
      signature: body.signature,
    });
    return NextResponse.json(wrapResponse(vote), { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
