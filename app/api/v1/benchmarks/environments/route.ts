import { NextRequest, NextResponse } from 'next/server';
import { createEnvironmentProfile, listEnvironmentProfiles } from '@/lib/services/benchmarks';
import { verifySignatureFromBody } from '@/lib/middleware/verify-signature';
import { handleApiError, wrapResponse, wrapPaginatedResponse } from '@/lib/errors';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const offset = parseInt(searchParams.get('offset') || '0') || 0;

    const { profiles, total } = await listEnvironmentProfiles({
      author: searchParams.get('author') || undefined,
      limit,
      offset,
    });

    return NextResponse.json(wrapPaginatedResponse(profiles, total, limit, offset));
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const author = await verifySignatureFromBody(body);

    const profile = await createEnvironmentProfile({
      author,
      modelProvider: body.model_provider,
      modelName: body.model_name,
      framework: body.framework,
      frameworkVersion: body.framework_version,
      channels: body.channels,
      skills: body.skills,
      os: body.os,
      additional: body.additional,
      signature: body.signature,
    });

    return NextResponse.json(wrapResponse(profile), { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
