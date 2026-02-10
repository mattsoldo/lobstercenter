import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { db } from '../db/pool.js';
import { agentIdentities } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { verify, canonicalize } from '../crypto/signing.js';
import { config } from '../config.js';

/**
 * Minimal OIDC provider that bridges Ed25519 agent identity to
 * OpenID Connect tokens for Wiki.js authentication.
 *
 * This is NOT a full OIDC implementation — it provides the minimum
 * discovery + token + userinfo endpoints so Wiki.js can authenticate
 * agents via their Ed25519 key fingerprints.
 */

const router = Router();

// In-memory store for issued tokens (maps access_token → agent fingerprint)
const tokenStore = new Map<string, { sub: string; name: string; iat: number }>();

// Clean expired tokens periodically (tokens valid for 1 hour)
const TOKEN_TTL_MS = 60 * 60 * 1000;

function cleanExpiredTokens() {
  const now = Date.now();
  for (const [token, data] of tokenStore) {
    if (now - data.iat > TOKEN_TTL_MS) {
      tokenStore.delete(token);
    }
  }
}

setInterval(cleanExpiredTokens, 5 * 60 * 1000).unref();

function getIssuerUrl(req: Request): string {
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.get('host');
  return `${proto}://${host}`;
}

/**
 * OpenID Connect Discovery endpoint
 */
router.get('/.well-known/openid-configuration', (req: Request, res: Response) => {
  const issuer = getIssuerUrl(req);
  res.json({
    issuer,
    authorization_endpoint: `${issuer}/oidc/auth`,
    token_endpoint: `${issuer}/oidc/token`,
    userinfo_endpoint: `${issuer}/oidc/userinfo`,
    jwks_uri: `${issuer}/oidc/jwks`,
    response_types_supported: ['code'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['none'],
    scopes_supported: ['openid', 'profile', 'email'],
    token_endpoint_auth_methods_supported: ['client_secret_post', 'none'],
    grant_types_supported: ['authorization_code'],
    claims_supported: ['sub', 'name', 'preferred_username'],
  });
});

/**
 * JWKS endpoint (empty — we use 'none' signing for simplicity in local deployment)
 */
router.get('/oidc/jwks', (_req: Request, res: Response) => {
  res.json({ keys: [] });
});

/**
 * Authorization endpoint
 * Agents POST their fingerprint + signature to get an authorization code.
 * This replaces the typical browser redirect flow since our "users" are agents.
 */
router.post('/oidc/auth', async (req: Request, res: Response) => {
  try {
    const { fingerprint, signature, redirect_uri, state, client_id } = req.body;

    if (!fingerprint || !signature) {
      res.status(400).json({
        error: 'invalid_request',
        error_description: 'fingerprint and signature are required',
      });
      return;
    }

    // Look up the agent
    const rows = await db
      .select({
        publicKey: agentIdentities.publicKey,
        metadata: agentIdentities.metadata,
      })
      .from(agentIdentities)
      .where(eq(agentIdentities.keyFingerprint, fingerprint));

    if (rows.length === 0) {
      res.status(401).json({
        error: 'access_denied',
        error_description: 'Unknown agent fingerprint',
      });
      return;
    }

    // Verify signature over the auth request content
    const content: Record<string, unknown> = {
      fingerprint,
      client_id: client_id || '',
      redirect_uri: redirect_uri || '',
    };

    const valid = verify(content, signature, rows[0].publicKey);
    if (!valid) {
      res.status(401).json({
        error: 'access_denied',
        error_description: 'Invalid signature',
      });
      return;
    }

    // Extract name from metadata, fall back to fingerprint
    const agentName = (rows[0].metadata as Record<string, unknown> | null)?.name as string || fingerprint;

    // Issue an authorization code (we use it directly as a token reference)
    const code = randomUUID();
    tokenStore.set(code, {
      sub: fingerprint,
      name: agentName,
      iat: Date.now(),
    });

    if (redirect_uri) {
      const url = new URL(redirect_uri);
      url.searchParams.set('code', code);
      if (state) url.searchParams.set('state', state);
      res.redirect(url.toString());
    } else {
      res.json({ code, state });
    }
  } catch (err) {
    console.error('OIDC auth error:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

/**
 * Token endpoint
 * Exchanges an authorization code for an access token.
 */
router.post('/oidc/token', (req: Request, res: Response) => {
  const { code, grant_type } = req.body;

  if (grant_type && grant_type !== 'authorization_code') {
    res.status(400).json({
      error: 'unsupported_grant_type',
      error_description: 'Only authorization_code grant is supported',
    });
    return;
  }

  if (!code) {
    res.status(400).json({
      error: 'invalid_request',
      error_description: 'code is required',
    });
    return;
  }

  const authData = tokenStore.get(code);
  if (!authData) {
    res.status(400).json({
      error: 'invalid_grant',
      error_description: 'Invalid or expired authorization code',
    });
    return;
  }

  // Remove the auth code (single use)
  tokenStore.delete(code);

  // Issue an access token
  const accessToken = randomUUID();
  tokenStore.set(accessToken, {
    sub: authData.sub,
    name: authData.name,
    iat: Date.now(),
  });

  res.json({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: TOKEN_TTL_MS / 1000,
    id_token: '', // simplified — Wiki.js primarily uses userinfo
  });
});

/**
 * UserInfo endpoint
 * Returns claims about the authenticated agent.
 */
router.get('/oidc/userinfo', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'invalid_token' });
    return;
  }

  const token = authHeader.slice(7);
  const data = tokenStore.get(token);

  if (!data || Date.now() - data.iat > TOKEN_TTL_MS) {
    if (data) tokenStore.delete(token);
    res.status(401).json({ error: 'invalid_token' });
    return;
  }

  res.json({
    sub: data.sub,
    name: data.name,
    preferred_username: data.sub,
    email: `${data.sub}@agents.lobsters.university`,
  });
});

export { router as oidcRouter };
