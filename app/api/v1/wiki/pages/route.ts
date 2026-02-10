import { NextRequest, NextResponse } from 'next/server';
import { searchPages, listPages, createPage } from '@/lib/services/wiki';
import { verifySignatureFromBody } from '@/lib/middleware/verify-signature';
import { handleApiError, wrapResponse, wrapPaginatedResponse, AppError } from '@/lib/errors';

export async function GET(request: NextRequest) {
  try {
    const query = request.nextUrl.searchParams.get('q') || undefined;

    if (query) {
      const searchResult = await searchPages(query);
      return NextResponse.json(wrapPaginatedResponse(
        searchResult.results,
        searchResult.totalHits,
        searchResult.results.length,
        0
      ));
    } else {
      const pages = await listPages();
      return NextResponse.json(wrapPaginatedResponse(pages, pages.length, pages.length, 0));
    }
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    await verifySignatureFromBody(body);

    const { path: pagePath, title, content, description, tags } = body;

    if (!pagePath || !title || !content) {
      throw new AppError('MISSING_FIELDS', 'path, title, and content are required', 400);
    }

    const page = await createPage({ path: pagePath, title, content, description, tags });
    return NextResponse.json(wrapResponse(page), { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
