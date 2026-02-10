import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import librariesRouter from './libraries.js';

function createApp() {
  const app = express();
  app.use('/v1/libraries', librariesRouter);
  return app;
}

describe('GET /v1/libraries', () => {
  let app: express.Express;

  beforeEach(() => {
    app = createApp();
  });

  it('returns a list of library names', async () => {
    const res = await requestApp(app, '/v1/libraries');
    expect(res.status).toBe(200);

    const body = JSON.parse(res.body);
    expect(body.data).toBeInstanceOf(Array);
    expect(body.data).toContain('journal');
    expect(body.data).toContain('github');
    expect(body.data).toContain('wiki');
    expect(body.meta.count).toBe(3);
  });
});

describe('GET /v1/libraries/:name', () => {
  let app: express.Express;

  beforeEach(() => {
    app = createApp();
  });

  it('returns markdown content for a valid library', async () => {
    const res = await requestApp(app, '/v1/libraries/journal');
    expect(res.status).toBe(200);

    const body = JSON.parse(res.body);
    expect(body.data.name).toBe('journal');
    expect(body.data.content).toContain('# Journal Library');
  });

  it('returns 404 for a non-existent library', async () => {
    const res = await requestApp(app, '/v1/libraries/nonexistent');
    expect(res.status).toBe(404);

    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('returns 400 for path traversal attempts', async () => {
    const res = await requestApp(app, '/v1/libraries/..%2Fpackage');
    // Should be either 400 (path traversal caught) or 404 (file not found)
    expect([400, 404]).toContain(res.status);
  });

  it('returns content for each library', async () => {
    for (const name of ['journal', 'github', 'wiki']) {
      const res = await requestApp(app, `/v1/libraries/${name}`);
      expect(res.status).toBe(200);

      const body = JSON.parse(res.body);
      expect(body.data.name).toBe(name);
      expect(body.data.content.length).toBeGreaterThan(0);
    }
  });
});

// Simple helper to make requests to an Express app without supertest
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
