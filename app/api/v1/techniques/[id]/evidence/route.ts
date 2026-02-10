import { NextRequest, NextResponse } from 'next/server';
import { getEntriesForTechnique } from '@/lib/services/journal';
import { handleApiError, wrapResponse } from '@/lib/errors';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const grouped = await getEntriesForTechnique(id);
    // Reshape for backward compatibility
    return NextResponse.json(wrapResponse({
      reports: grouped['adoption-report'] || [],
      critiques: grouped['critique'] || [],
      comparisons: grouped['comparative-report'] || [],
    }));
  } catch (err) {
    return handleApiError(err);
  }
}
