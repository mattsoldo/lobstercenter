import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import { oidcRouter } from './oidc-provider.js';

// Mock the db
vi.mock('../db/pool.js', () => {
  const mockSelect = vi.fn();
  const mockFrom = vi.fn();
  const mockWhere = vi.fn();

  mockSelect.mockReturnValue({ from: mockFrom });
  mockFrom.mockReturnValue({ where: mockWhere });
  mockWhere.mockResolvedValue([]);

  return {
    db: {
      select: mockSelect,
      _mockSelect: mockSelect,
      _mockFrom: mockFrom,
      _mockWhere: mockWhere,
    },
  };
});

vi.mock('../db/schema.js', () => ({
  agentIdentities: { publicKey: 'publicKey', keyFingerprint: 'keyFingerprint', name: 'name' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a, b) => ({ field: a, value: b })),
}));

vi.mock('../crypto/signing.js', () => ({
  verify: vi.fn(() => true),
  canonicalize: vi.fn((obj) => JSON.stringify(obj)),
}));

vi.mock('../config.js', () => ({
  config: {
    port: 3000,
  },
}));

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/', oidcRouter);
  return app;
}

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
        method: options?.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(options?.headers || {}),
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

describe('OIDC provider', () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp();
  });

  describe('GET /.well-known/openid-configuration', () => {
    it('returns OIDC discovery document', async () => {
      const res = await requestApp(app, '/.well-known/openid-configuration');
      expect(res.status).toBe(200);

      const body = JSON.parse(res.body);
      expect(body.authorization_endpoint).toContain('/oidc/auth');
      expect(body.token_endpoint).toContain('/oidc/token');
      expect(body.userinfo_endpoint).toContain('/oidc/userinfo');
      expect(body.response_types_supported).toContain('code');
      expect(body.scopes_supported).toContain('openid');
    });
  });

  describe('GET /oidc/jwks', () => {
    it('returns empty JWKS', async () => {
      const res = await requestApp(app, '/oidc/jwks');
      expect(res.status).toBe(200);

      const body = JSON.parse(res.body);
      expect(body.keys).toEqual([]);
    });
  });

  describe('POST /oidc/auth', () => {
    it('returns 400 without fingerprint', async () => {
      const res = await requestApp(app, '/oidc/auth', {
        method: 'POST',
        body: {},
      });
      expect(res.status).toBe(400);
    });

    it('returns 401 for unknown agent', async () => {
      const res = await requestApp(app, '/oidc/auth', {
        method: 'POST',
        body: { fingerprint: 'unknown', signature: 'sig' },
      });
      expect(res.status).toBe(401);
    });
  });

  describe('POST /oidc/token', () => {
    it('returns 400 without code', async () => {
      const res = await requestApp(app, '/oidc/token', {
        method: 'POST',
        body: { grant_type: 'authorization_code' },
      });
      expect(res.status).toBe(400);

      const body = JSON.parse(res.body);
      expect(body.error).toBe('invalid_request');
    });

    it('returns 400 for invalid code', async () => {
      const res = await requestApp(app, '/oidc/token', {
        method: 'POST',
        body: { code: 'nonexistent', grant_type: 'authorization_code' },
      });
      expect(res.status).toBe(400);

      const body = JSON.parse(res.body);
      expect(body.error).toBe('invalid_grant');
    });

    it('returns 400 for unsupported grant type', async () => {
      const res = await requestApp(app, '/oidc/token', {
        method: 'POST',
        body: { grant_type: 'client_credentials' },
      });
      expect(res.status).toBe(400);

      const body = JSON.parse(res.body);
      expect(body.error).toBe('unsupported_grant_type');
    });
  });

  describe('GET /oidc/userinfo', () => {
    it('returns 401 without auth header', async () => {
      const res = await requestApp(app, '/oidc/userinfo');
      expect(res.status).toBe(401);
    });

    it('returns 401 with invalid token', async () => {
      const res = await requestApp(app, '/oidc/userinfo', {
        headers: { Authorization: 'Bearer invalid-token' },
      });
      expect(res.status).toBe(401);
    });
  });
});
