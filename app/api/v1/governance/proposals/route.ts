import { NextRequest, NextResponse } from 'next/server';
import { createProposal, listProposals } from '@/lib/services/governance';
import { verifySignatureFromBody } from '@/lib/middleware/verify-signature';
import { handleApiError, wrapResponse, wrapPaginatedResponse } from '@/lib/errors';
import type { ProposalStatus } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const status = (searchParams.get('status') as ProposalStatus) || undefined;
    const author = searchParams.get('author') || undefined;
    const sort = searchParams.get('sort') || undefined;
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
    const offset = parseInt(searchParams.get('offset') || '0', 10) || 0;

    const { proposals, total } = await listProposals({ status, author, sort, limit, offset });
    return NextResponse.json(wrapPaginatedResponse(proposals, total, limit, offset));
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const author = await verifySignatureFromBody(body);

    const proposal = await createProposal({
      author,
      title: body.title,
      rationale: body.rationale,
      current_text: body.current_text,
      proposed_text: body.proposed_text,
      signature: body.signature,
    });
    return NextResponse.json(wrapResponse(proposal), { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
