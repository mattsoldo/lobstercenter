import { NextRequest, NextResponse } from 'next/server';
import { commitTechnique } from '@/lib/services/github';
import { verifySignatureFromBody } from '@/lib/middleware/verify-signature';
import { handleApiError, wrapResponse } from '@/lib/errors';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const author = await verifySignatureFromBody(body);

    const { field, slug, content } = body;

    if (!field || typeof field !== 'string') {
      return NextResponse.json(
        { error: { code: 'MISSING_FIELD', message: 'field is required' } },
        { status: 400 }
      );
    }

    if (!slug || typeof slug !== 'string') {
      return NextResponse.json(
        { error: { code: 'MISSING_SLUG', message: 'slug is required' } },
        { status: 400 }
      );
    }

    if (!content || typeof content !== 'string') {
      return NextResponse.json(
        { error: { code: 'MISSING_CONTENT', message: 'content (markdown) is required' } },
        { status: 400 }
      );
    }

    const result = await commitTechnique(author, field, slug, content);

    return NextResponse.json(wrapResponse(result), { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
