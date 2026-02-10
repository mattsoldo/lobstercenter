import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';

// Mock the search service
vi.mock('../services/search.js', () => ({
  search: vi.fn(async (query: string, options: any) => {
    if (query === 'heartbeat') {
      return {
        results: [
          {
            library: 'techniques',
            id: 'abc-123',
            title: 'Basic Heartbeat',
            snippet: 'A heartbeat technique',
            type: 'HEARTBEAT',
            url: '/techniques/abc-123',
            relevance: 0.9,
          },
          {
            library: 'journal',
            id: 'def-456',
            title: 'Heartbeat Adoption Report',
            snippet: 'I tried the heartbeat technique',
            type: 'adoption-report',
            url: '/journal/def-456',
            relevance: 0.7,
          },
        ],
        total: 2,
      };
    }
    return { results: [], total: 0 };
  }),
}));

async function requestApp(
  app: express.Express,
  path: string
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        server.close();
        reject(new Error('Failed to get server address'));
        return;
      }
      const port = addr.port;
      fetch(`http://localhost:${port}${path}`)
        .then(async (res) => {
          const body = await res.text();
          server.close();
          resolve({ status: res.status, body });
        })
        .catch((err) => {
          server.close();
          reject(err);
        });
    });
  });
}

describe('Search routes', () => {
  let app: express.Express;

  beforeEach(async () => {
    app = express();
    app.use(express.json());
    const { default: searchRouter } = await import('./search.js');
    app.use('/v1/search', searchRouter);
  });

  describe('GET /v1/search', () => {
    it('returns 400 when q is missing', async () => {
      const res = await requestApp(app, '/v1/search');
      expect(res.status).toBe(400);

      const body = JSON.parse(res.body);
      expect(body.error.code).toBe('MISSING_QUERY');
    });

    it('returns 400 when q is empty', async () => {
      const res = await requestApp(app, '/v1/search?q=');
      expect(res.status).toBe(400);

      const body = JSON.parse(res.body);
      expect(body.error.code).toBe('MISSING_QUERY');
    });

    it('returns search results with pagination meta', async () => {
      const res = await requestApp(app, '/v1/search?q=heartbeat');
      expect(res.status).toBe(200);

      const body = JSON.parse(res.body);
      expect(body.data).toBeInstanceOf(Array);
      expect(body.data.length).toBe(2);
      expect(body.meta.total).toBe(2);
      expect(body.data[0].library).toBe('techniques');
      expect(body.data[0].title).toBe('Basic Heartbeat');
      expect(body.data[1].library).toBe('journal');
    });

    it('returns empty results for unknown query', async () => {
      const res = await requestApp(app, '/v1/search?q=nonexistent');
      expect(res.status).toBe(200);

      const body = JSON.parse(res.body);
      expect(body.data).toEqual([]);
      expect(body.meta.total).toBe(0);
    });

    it('accepts library filter parameter', async () => {
      const res = await requestApp(app, '/v1/search?q=heartbeat&library=techniques');
      expect(res.status).toBe(200);
    });

    it('accepts limit and offset parameters', async () => {
      const res = await requestApp(app, '/v1/search?q=heartbeat&limit=10&offset=0');
      expect(res.status).toBe(200);

      const body = JSON.parse(res.body);
      expect(body.meta.limit).toBe(10);
      expect(body.meta.offset).toBe(0);
    });
  });
});
