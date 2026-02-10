import { NextRequest, NextResponse } from 'next/server';
import { createComment, listComments } from '@/lib/services/governance';
import { verifySignatureFromBody } from '@/lib/middleware/verify-signature';
import { handleApiError, wrapResponse } from '@/lib/errors';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const comments = await listComments(id);
    return NextResponse.json(wrapResponse(comments));
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

    const comment = await createComment(id, {
      author,
      body: body.body,
      signature: body.signature,
    });
    return NextResponse.json(wrapResponse(comment), { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
