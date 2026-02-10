import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import crypto from 'crypto';

// Mock the github service
vi.mock('../services/github.js', () => ({
  syncPath: vi.fn(async () => {}),
}));

// Mock config
vi.mock('../config.js', () => ({
  config: {
    github: {
      webhookSecret: 'test-webhook-secret',
    },
  },
}));

// Simple helper to make requests to an Express app
async function requestApp(
  app: express.Express,
  path: string,
  options?: { method?: string; body?: unknown; headers?: Record<string, string> }
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
        method: options?.method || 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers,
        },
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

function signPayload(payload: string, secret: string): string {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

describe('Webhook routes', () => {
  let app: express.Express;

  beforeEach(async () => {
    app = express();
    app.use(express.json());
    const { default: webhooksRouter } = await import('./webhooks.js');
    app.use('/webhooks', webhooksRouter);
  });

  describe('POST /webhooks/github', () => {
    it('rejects requests with invalid signature', async () => {
      const payload = { ref: 'refs/heads/main', after: 'abc123', commits: [] };
      const res = await requestApp(app, '/webhooks/github', {
        body: payload,
        headers: {
          'x-github-event': 'push',
          'x-hub-signature-256': 'sha256=invalidsignature',
        },
      });
      expect(res.status).toBe(401);
    });

    it('ignores non-push events with valid signature', async () => {
      const payload = { action: 'opened' };
      const payloadStr = JSON.stringify(payload);
      const signature = signPayload(payloadStr, 'test-webhook-secret');

      const res = await requestApp(app, '/webhooks/github', {
        body: payload,
        headers: {
          'x-github-event': 'pull_request',
          'x-hub-signature-256': signature,
        },
      });
      expect(res.status).toBe(200);

      const body = JSON.parse(res.body);
      expect(body.message).toBe('Event ignored');
    });

    it('processes push events with markdown file changes', async () => {
      const payload = {
        ref: 'refs/heads/main',
        after: 'commitsha123',
        commits: [
          {
            added: ['techniques/new-technique.md'],
            modified: ['README.md'],
            removed: [],
          },
        ],
      };
      const payloadStr = JSON.stringify(payload);
      const signature = signPayload(payloadStr, 'test-webhook-secret');

      const res = await requestApp(app, '/webhooks/github', {
        body: payload,
        headers: {
          'x-github-event': 'push',
          'x-hub-signature-256': signature,
        },
      });
      expect(res.status).toBe(200);

      const body = JSON.parse(res.body);
      expect(body.message).toBe('Webhook processed');
      expect(body.synced).toBe(2);
    });
  });
});
