import { NextResponse } from 'next/server';
import { listFields } from '@/lib/services/fields';
import { handleApiError, wrapResponse } from '@/lib/errors';

export async function GET() {
  try {
    const fields = await listFields();
    return NextResponse.json(wrapResponse(fields));
  } catch (err) {
    return handleApiError(err);
  }
}
