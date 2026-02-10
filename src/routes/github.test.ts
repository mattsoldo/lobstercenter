import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';

// Mock the github service
vi.mock('../services/github.js', () => ({
  searchIndex: vi.fn(async (query, filters) => ({
    results: [
      {
        id: '123e4567-e89b-12d3-a456-426614174000',
        githubPath: 'techniques/heartbeat/basic.md',
        contentType: 'technique',
        title: 'Basic Heartbeat',
        description: 'A basic heartbeat technique',
        field: 'heartbeat',
        authorFingerprint: null,
        commitSha: 'abc123',
        updatedAt: new Date().toISOString(),
      },
    ],
    total: 1,
  })),
  syncRepo: vi.fn(async () => ({ synced: 3, errors: [] })),
  commitTechnique: vi.fn(async (fp, field, slug, content) => ({
    commitSha: 'abc123def456',
    path: `techniques/${field}/${slug}.md`,
  })),
}));

// Mock db for the direct query in the route
vi.mock('../db/pool.js', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => [
          {
            id: '123e4567-e89b-12d3-a456-426614174000',
            githubPath: 'README.md',
            contentType: 'document',
            title: 'README',
            description: 'Project readme',
            rawContent: '# Test',
            frontmatter: {},
            field: null,
            authorFingerprint: null,
            commitSha: 'abc123',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ]),
      })),
    })),
  },
}));

// Mock schema
vi.mock('../db/schema.js', () => ({
  githubIndex: {
    id: 'id',
    githubPath: 'github_path',
    contentType: 'content_type',
    title: 'title',
    description: 'description',
    rawContent: 'raw_content',
    frontmatter: 'frontmatter',
    field: 'field',
    authorFingerprint: 'author_fingerprint',
    commitSha: 'commit_sha',
    updatedAt: 'updated_at',
  },
  agentIdentities: {
    keyFingerprint: 'key_fingerprint',
    publicKey: 'public_key',
  },
}));

// Mock signature middleware to skip auth in tests
vi.mock('../middleware/signature.js', () => ({
  verifySignature: (req: any, _res: any, next: any) => {
    req.verifiedAuthor = 'test-fingerprint-abc123';
    next();
  },
}));

// Simple helper to make requests to an Express app
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
      };
      if (options?.body) {
        fetchOptions.headers = { 'Content-Type': 'application/json' };
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

describe('GitHub routes', () => {
  let app: express.Express;

  beforeEach(async () => {
    app = express();
    app.use(express.json());
    const { default: githubRouter } = await import('./github.js');
    app.use('/v1/github', githubRouter);
  });

  describe('GET /v1/github/index', () => {
    it('returns indexed content with pagination meta', async () => {
      const res = await requestApp(app, '/v1/github/index');
      expect(res.status).toBe(200);

      const body = JSON.parse(res.body);
      expect(body.data).toBeInstanceOf(Array);
      expect(body.meta.total).toBe(1);
      expect(body.data[0].githubPath).toBe('techniques/heartbeat/basic.md');
    });

    it('accepts query parameters', async () => {
      const res = await requestApp(app, '/v1/github/index?q=heartbeat&content_type=technique&limit=10');
      expect(res.status).toBe(200);

      const body = JSON.parse(res.body);
      expect(body.data).toBeInstanceOf(Array);
    });
  });

  describe('GET /v1/github/index/*', () => {
    it('returns a specific indexed file', async () => {
      const res = await requestApp(app, '/v1/github/index/README.md');
      expect(res.status).toBe(200);

      const body = JSON.parse(res.body);
      expect(body.data.githubPath).toBe('README.md');
    });
  });

  describe('POST /v1/github/contributions', () => {
    it('creates a contribution with valid data', async () => {
      const res = await requestApp(app, '/v1/github/contributions', {
        method: 'POST',
        body: {
          author: 'test-fingerprint-abc123',
          field: 'heartbeat',
          slug: 'my-technique',
          content: '# My Technique\n\nDescription here.',
          signature: 'test-sig',
        },
      });
      expect(res.status).toBe(201);

      const body = JSON.parse(res.body);
      expect(body.data.path).toBe('techniques/heartbeat/my-technique.md');
      expect(body.data.commitSha).toBe('abc123def456');
    });

    it('rejects missing field', async () => {
      const res = await requestApp(app, '/v1/github/contributions', {
        method: 'POST',
        body: {
          author: 'test-fingerprint-abc123',
          slug: 'my-technique',
          content: '# Content',
          signature: 'test-sig',
        },
      });
      expect(res.status).toBe(400);
    });

    it('rejects missing slug', async () => {
      const res = await requestApp(app, '/v1/github/contributions', {
        method: 'POST',
        body: {
          author: 'test-fingerprint-abc123',
          field: 'heartbeat',
          content: '# Content',
          signature: 'test-sig',
        },
      });
      expect(res.status).toBe(400);
    });

    it('rejects missing content', async () => {
      const res = await requestApp(app, '/v1/github/contributions', {
        method: 'POST',
        body: {
          author: 'test-fingerprint-abc123',
          field: 'heartbeat',
          slug: 'my-technique',
          signature: 'test-sig',
        },
      });
      expect(res.status).toBe(400);
    });
  });
});
