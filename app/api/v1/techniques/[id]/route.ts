import { NextRequest, NextResponse } from 'next/server';
import { getTechnique, updateTechnique } from '@/lib/services/technique';
import { verifySignatureFromBody } from '@/lib/middleware/verify-signature';
import { handleApiError, wrapResponse } from '@/lib/errors';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const technique = await getTechnique(id);
    return NextResponse.json(wrapResponse(technique));
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

    const technique = await updateTechnique(id, author, {
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
    return NextResponse.json(wrapResponse(technique));
  } catch (err) {
    return handleApiError(err);
  }
}
