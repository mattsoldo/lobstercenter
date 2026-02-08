import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

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

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message },
    });
    return;
  }

  console.error('Unhandled error:', err);
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred' },
  });
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
