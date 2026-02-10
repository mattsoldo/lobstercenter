import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { handleApiError } from '@/lib/errors';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params;
    const librariesDir = path.join(process.cwd(), 'libraries');
    const filePath = path.join(librariesDir, `${name}.md`);

    // Prevent path traversal
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(path.resolve(librariesDir))) {
      return NextResponse.json(
        { error: { code: 'INVALID_NAME', message: 'Invalid library name.' } },
        { status: 400 }
      );
    }

    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      return NextResponse.json({
        data: { name, content },
      });
    } catch {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: `Library "${name}" not found.` } },
        { status: 404 }
      );
    }
  } catch (err) {
    return handleApiError(err);
  }
}
