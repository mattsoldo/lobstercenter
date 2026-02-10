import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import wikiRouter from './wiki.js';
import { errorHandler } from '../middleware/error.js';

// Mock the wiki service
vi.mock('../services/wiki.js', () => ({
  getPage: vi.fn(),
  searchPages: vi.fn(),
  listPages: vi.fn(),
  createPage: vi.fn(),
  updatePage: vi.fn(),
}));

// Mock the signature middleware to pass through
vi.mock('../middleware/signature.js', () => ({
  verifySignature: (req: any, _res: any, next: any) => {
    req.verifiedAuthor = 'test-fingerprint';
    next();
  },
}));

import { getPage, searchPages, listPages, createPage, updatePage } from '../services/wiki.js';

const mockGetPage = vi.mocked(getPage);
const mockSearchPages = vi.mocked(searchPages);
const mockListPages = vi.mocked(listPages);
const mockCreatePage = vi.mocked(createPage);
const mockUpdatePage = vi.mocked(updatePage);

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/v1/wiki', wikiRouter);
  app.use(errorHandler);
  return app;
}

async function requestApp(
  app: express.Express,
  path: string,
  options?: { method?: string; body?: unknown }
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
      const fetchOptions: RequestInit = {
        method: options?.method || 'GET',
        headers: { 'Content-Type': 'application/json' },
      };
      if (options?.body) {
        fetchOptions.body = JSON.stringify(options.body);
      }
      fetch(`http://localhost:${port}${path}`, fetchOptions)
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

describe('wiki routes', () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp();
  });

  describe('GET /v1/wiki/pages', () => {
    it('lists pages when no query', async () => {
      mockListPages.mockResolvedValue([
        { id: 1, path: 'home', title: 'Home', description: '', createdAt: '', updatedAt: '' },
      ]);

      const res = await requestApp(app, '/v1/wiki/pages');
      expect(res.status).toBe(200);

      const body = JSON.parse(res.body);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].path).toBe('home');
    });

    it('searches pages when query is provided', async () => {
      mockSearchPages.mockResolvedValue({
        results: [
          { id: '1', title: 'Home', description: '', path: 'home', locale: 'en' },
        ],
        suggestions: [],
        totalHits: 1,
      });

      const res = await requestApp(app, '/v1/wiki/pages?q=home');
      expect(res.status).toBe(200);

      const body = JSON.parse(res.body);
      expect(body.data).toHaveLength(1);
      expect(body.meta.total).toBe(1);
    });
  });

  describe('GET /v1/wiki/pages/*', () => {
    it('returns a page by path', async () => {
      mockGetPage.mockResolvedValue({
        id: 1,
        path: 'home',
        title: 'Home',
        description: 'Welcome',
        content: '# Home',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      });

      const res = await requestApp(app, '/v1/wiki/pages/home');
      expect(res.status).toBe(200);

      const body = JSON.parse(res.body);
      expect(body.data.title).toBe('Home');
    });

    it('returns 404 for nonexistent page', async () => {
      mockGetPage.mockResolvedValue(null);

      const res = await requestApp(app, '/v1/wiki/pages/nonexistent');
      expect(res.status).toBe(404);

      const body = JSON.parse(res.body);
      expect(body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('POST /v1/wiki/pages', () => {
    it('creates a page', async () => {
      mockCreatePage.mockResolvedValue({ id: 42, path: 'new-page' });

      const res = await requestApp(app, '/v1/wiki/pages', {
        method: 'POST',
        body: {
          path: 'new-page',
          title: 'New Page',
          content: '# Hello',
          author: 'test-fingerprint',
          signature: 'fake-sig',
        },
      });
      expect(res.status).toBe(201);

      const body = JSON.parse(res.body);
      expect(body.data.id).toBe(42);
    });

    it('returns 400 when required fields missing', async () => {
      const res = await requestApp(app, '/v1/wiki/pages', {
        method: 'POST',
        body: {
          title: 'No path',
          author: 'test-fingerprint',
          signature: 'fake-sig',
        },
      });
      expect(res.status).toBe(400);
    });
  });

  describe('PUT /v1/wiki/pages/:id', () => {
    it('updates a page', async () => {
      mockUpdatePage.mockResolvedValue(undefined);

      const res = await requestApp(app, '/v1/wiki/pages/1', {
        method: 'PUT',
        body: {
          content: '# Updated',
          author: 'test-fingerprint',
          signature: 'fake-sig',
        },
      });
      expect(res.status).toBe(200);

      const body = JSON.parse(res.body);
      expect(body.data.updated).toBe(true);
    });

    it('returns 400 for non-numeric ID', async () => {
      const res = await requestApp(app, '/v1/wiki/pages/abc', {
        method: 'PUT',
        body: {
          content: '# Updated',
          author: 'test-fingerprint',
          signature: 'fake-sig',
        },
      });
      expect(res.status).toBe(400);

      const body = JSON.parse(res.body);
      expect(body.error.code).toBe('INVALID_ID');
    });
  });
});
