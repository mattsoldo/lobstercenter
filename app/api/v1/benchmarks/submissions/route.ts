import { NextRequest, NextResponse } from 'next/server';
import { createSubmission, listSubmissions } from '@/lib/services/benchmarks';
import { verifySignatureFromBody } from '@/lib/middleware/verify-signature';
import { handleApiError, wrapResponse, wrapPaginatedResponse } from '@/lib/errors';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const offset = parseInt(searchParams.get('offset') || '0') || 0;

    const { submissions, total } = await listSubmissions({
      submissionType: searchParams.get('submission_type') || undefined,
      field: searchParams.get('field') || undefined,
      author: searchParams.get('author') || undefined,
      techniqueId: searchParams.get('technique_id') || undefined,
      q: searchParams.get('q') || undefined,
      limit,
      offset,
    });

    return NextResponse.json(wrapPaginatedResponse(submissions, total, limit, offset));
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const author = await verifySignatureFromBody(body);

    const submission = await createSubmission({
      author,
      environmentId: body.environment_id,
      submissionType: body.submission_type,
      techniqueIds: body.technique_ids,
      field: body.field,
      title: body.title,
      methodology: body.methodology,
      measurements: body.measurements,
      metadata: body.metadata,
      parentSubmissionId: body.parent_submission_id,
      signature: body.signature,
    });

    return NextResponse.json(wrapResponse(submission), { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
