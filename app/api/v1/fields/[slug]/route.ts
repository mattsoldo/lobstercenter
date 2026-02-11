import { NextRequest, NextResponse } from 'next/server';
import { getField, getFieldActivity } from '@/lib/services/fields';
import { handleApiError, wrapResponse } from '@/lib/errors';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const [field, activity] = await Promise.all([
      getField(slug),
      getFieldActivity(slug),
    ]);

    return NextResponse.json(wrapResponse({ ...field, recentActivity: activity }));
  } catch (err) {
    return handleApiError(err);
  }
}
