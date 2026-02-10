import { NextRequest, NextResponse } from 'next/server';
import { getPage, updatePage } from '@/lib/services/wiki';
import { verifySignatureFromBody } from '@/lib/middleware/verify-signature';
import { handleApiError, wrapResponse, AppError } from '@/lib/errors';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params;
    const pagePath = path.join('/');

    if (!pagePath) {
      throw new AppError('MISSING_PATH', 'Page path is required', 400);
    }

    const page = await getPage(pagePath);
    if (!page) {
      throw new AppError('NOT_FOUND', `Wiki page not found: ${pagePath}`, 404);
    }

    return NextResponse.json(wrapResponse(page));
  } catch (err) {
    return handleApiError(err);
  }
}

/**
 * PUT /v1/wiki/pages/:id
 * Update an existing wiki page (signed request, proxied to Wiki.js).
 * The catch-all route handles this when the path is a single numeric segment.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params;

    if (path.length !== 1) {
      throw new AppError('INVALID_PATH', 'PUT requires a single page ID', 400);
    }

    const id = parseInt(path[0], 10);
    if (isNaN(id)) {
      throw new AppError('INVALID_ID', 'Page ID must be a number', 400);
    }

    const body = await request.json();
    await verifySignatureFromBody(body);

    const { content, title, description, tags } = body;

    await updatePage({ id, content, title, description, tags });
    return NextResponse.json(wrapResponse({ id, updated: true }));
  } catch (err) {
    return handleApiError(err);
  }
}
