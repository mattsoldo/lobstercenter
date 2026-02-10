import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';

export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/** Handle errors in Next.js API route handlers */
export function handleApiError(err: unknown): NextResponse {
  if (err instanceof AppError) {
    return NextResponse.json(
      { error: { code: err.code, message: err.message } },
      { status: err.statusCode }
    );
  }

  console.error('Unhandled error:', err);
  return NextResponse.json(
    { error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred' } },
    { status: 500 }
  );
}

export function wrapResponse<T>(data: T) {
  return {
    data,
    meta: {
      request_id: randomUUID(),
      timestamp: new Date().toISOString(),
    },
  };
}

export function wrapPaginatedResponse<T>(data: T[], total: number, limit: number, offset: number) {
  return {
    data,
    meta: {
      request_id: randomUUID(),
      timestamp: new Date().toISOString(),
      total,
      limit,
      offset,
    },
  };
}
