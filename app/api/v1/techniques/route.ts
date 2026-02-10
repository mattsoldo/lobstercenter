import { NextRequest, NextResponse } from 'next/server';
import { createTechnique, listTechniques } from '@/lib/services/technique';
import { verifySignatureFromBody } from '@/lib/middleware/verify-signature';
import { handleApiError, wrapResponse, wrapPaginatedResponse } from '@/lib/errors';
import type { TargetSurface } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0'), 0);

    const { techniques, total } = await listTechniques({
      q: searchParams.get('q') || undefined,
      surface: (searchParams.get('surface') as TargetSurface) || undefined,
      model: searchParams.get('model') || undefined,
      channel: searchParams.get('channel') || undefined,
      sort: (searchParams.get('sort') as 'recent' | 'most_evidence' | 'most_adopted') || undefined,
      limit,
      offset,
    });

    return NextResponse.json(wrapPaginatedResponse(techniques, total, limit, offset));
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const author = await verifySignatureFromBody(body);

    const technique = await createTechnique({
      author,
      title: body.title,
      description: body.description,
      target_surface: body.target_surface,
      target_file: body.target_file,
      implementation: body.implementation,
      context_model: body.context_model,
      context_channels: body.context_channels,
      context_workflow: body.context_workflow,
      code_url: body.code_url,
      code_commit_sha: body.code_commit_sha,
      signature: body.signature,
    });
    return NextResponse.json(wrapResponse(technique), { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
