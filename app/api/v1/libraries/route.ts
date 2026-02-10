import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { handleApiError } from '@/lib/errors';

export async function GET() {
  try {
    const librariesDir = path.join(process.cwd(), 'libraries');
    const files = await fs.promises.readdir(librariesDir);
    const libraries = files
      .filter((f) => f.endsWith('.md'))
      .map((f) => f.replace(/\.md$/, ''));

    return NextResponse.json({
      data: libraries,
      meta: { count: libraries.length },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
