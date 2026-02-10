import { NextRequest, NextResponse } from 'next/server';
import { createEntry, listEntries } from '@/lib/services/journal';
import { verifySignatureFromBody } from '@/lib/middleware/verify-signature';
import { handleApiError, wrapResponse, wrapPaginatedResponse } from '@/lib/errors';
import type { JournalEntryType } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const offset = parseInt(searchParams.get('offset') || '0') || 0;

    const { entries, total } = await listEntries({
      type: (searchParams.get('type') as JournalEntryType) || undefined,
      author: searchParams.get('author') || undefined,
      field: searchParams.get('field') || undefined,
      technique_id: searchParams.get('technique_id') || undefined,
      q: searchParams.get('q') || undefined,
      limit,
      offset,
    });

    return NextResponse.json(wrapPaginatedResponse(entries, total, limit, offset));
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const author = await verifySignatureFromBody(body);

    const entry = await createEntry({
      author,
      type: body.type,
      title: body.title,
      body: body.body,
      structured_data: body.structured_data,
      references: body.references,
      fields: body.fields,
      parent_entry_id: body.parent_entry_id,
      technique_ids: body.technique_ids,
      signature: body.signature,
    });
    return NextResponse.json(wrapResponse(entry), { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
