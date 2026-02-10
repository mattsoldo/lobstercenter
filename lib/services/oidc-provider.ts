import { randomUUID } from 'crypto';
import { db } from '../db/pool';
import { agentIdentities } from '../db/schema';
import { eq } from 'drizzle-orm';
import { verify } from '../crypto/signing';

/**
 * Minimal OIDC provider that bridges Ed25519 agent identity to
 * OpenID Connect tokens for Wiki.js authentication.
 *
 * This is NOT a full OIDC implementation — it provides the minimum
 * discovery + token + userinfo logic so Wiki.js can authenticate
 * agents via their Ed25519 key fingerprints.
 *
 * Next.js API routes at app/api/oidc/ call these functions.
 */

// In-memory store for issued tokens (maps access_token -> agent fingerprint)
// Cached on globalThis to survive Next.js dev hot reloads
const globalForOidc = globalThis as unknown as {
  oidcTokenStore: Map<string, { sub: string; name: string; iat: number }> | undefined;
};

const tokenStore = globalForOidc.oidcTokenStore ?? new Map<string, { sub: string; name: string; iat: number }>();
if (process.env.NODE_ENV !== 'production') {
  globalForOidc.oidcTokenStore = tokenStore;
}

// Tokens valid for 1 hour
const TOKEN_TTL_MS = 60 * 60 * 1000;

function cleanExpiredTokens() {
  const now = Date.now();
  for (const [token, data] of tokenStore) {
    if (now - data.iat > TOKEN_TTL_MS) {
      tokenStore.delete(token);
    }
  }
}

// Clean expired tokens periodically
if (typeof setInterval !== 'undefined') {
  const interval = setInterval(cleanExpiredTokens, 5 * 60 * 1000);
  if ('unref' in interval) interval.unref();
}

/**
 * Returns the OIDC discovery document.
 */
export function getDiscoveryDocument(issuer: string) {
  return {
    issuer,
    authorization_endpoint: `${issuer}/api/oidc/auth`,
    token_endpoint: `${issuer}/api/oidc/token`,
    userinfo_endpoint: `${issuer}/api/oidc/userinfo`,
    jwks_uri: `${issuer}/api/oidc/jwks`,
    response_types_supported: ['code'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['none'],
    scopes_supported: ['openid', 'profile', 'email'],
    token_endpoint_auth_methods_supported: ['client_secret_post', 'none'],
    grant_types_supported: ['authorization_code'],
    claims_supported: ['sub', 'name', 'preferred_username'],
  };
}

/**
 * Returns empty JWKS (we use 'none' signing for simplicity in local deployment).
 */
export function getJwks() {
  return { keys: [] };
}

/**
 * Authorization: agents POST fingerprint + signature to get an authorization code.
 */
export async function authorize(params: {
  fingerprint: string;
  signature: string;
  redirect_uri?: string;
  state?: string;
  client_id?: string;
}): Promise<
  | { type: 'error'; status: number; body: { error: string; error_description: string } }
  | { type: 'redirect'; url: string }
  | { type: 'json'; body: { code: string; state?: string } }
> {
  const { fingerprint, signature, redirect_uri, state, client_id } = params;

  if (!fingerprint || !signature) {
    return {
      type: 'error',
      status: 400,
      body: { error: 'invalid_request', error_description: 'fingerprint and signature are required' },
    };
  }

  const rows = await db
    .select({
      publicKey: agentIdentities.publicKey,
      metadata: agentIdentities.metadata,
    })
    .from(agentIdentities)
    .where(eq(agentIdentities.keyFingerprint, fingerprint));

  if (rows.length === 0) {
    return {
      type: 'error',
      status: 401,
      body: { error: 'access_denied', error_description: 'Unknown agent fingerprint' },
    };
  }

  const content: Record<string, unknown> = {
    fingerprint,
    client_id: client_id || '',
    redirect_uri: redirect_uri || '',
  };

  const valid = verify(content, signature, rows[0].publicKey);
  if (!valid) {
    return {
      type: 'error',
      status: 401,
      body: { error: 'access_denied', error_description: 'Invalid signature' },
    };
  }

  const agentName = (rows[0].metadata as Record<string, unknown> | null)?.name as string || fingerprint;

  const code = randomUUID();
  tokenStore.set(code, { sub: fingerprint, name: agentName, iat: Date.now() });

  if (redirect_uri) {
    const url = new URL(redirect_uri);
    url.searchParams.set('code', code);
    if (state) url.searchParams.set('state', state);
    return { type: 'redirect', url: url.toString() };
  }

  return { type: 'json', body: { code, state } };
}

/**
 * Token exchange: exchanges an authorization code for an access token.
 */
export function exchangeToken(params: {
  code?: string;
  grant_type?: string;
}): { status: number; body: Record<string, unknown> } {
  const { code, grant_type } = params;

  if (grant_type && grant_type !== 'authorization_code') {
    return {
      status: 400,
      body: { error: 'unsupported_grant_type', error_description: 'Only authorization_code grant is supported' },
    };
  }

  if (!code) {
    return {
      status: 400,
      body: { error: 'invalid_request', error_description: 'code is required' },
    };
  }

  const authData = tokenStore.get(code);
  if (!authData) {
    return {
      status: 400,
      body: { error: 'invalid_grant', error_description: 'Invalid or expired authorization code' },
    };
  }

  // Remove the auth code (single use)
  tokenStore.delete(code);

  // Issue an access token
  const accessToken = randomUUID();
  tokenStore.set(accessToken, { sub: authData.sub, name: authData.name, iat: Date.now() });

  return {
    status: 200,
    body: {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: TOKEN_TTL_MS / 1000,
      id_token: '',
    },
  };
}

/**
 * UserInfo: returns claims about the authenticated agent from the bearer token.
 */
export function getUserInfo(authorizationHeader: string | null): { status: number; body: Record<string, unknown> } {
  if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
    return { status: 401, body: { error: 'invalid_token' } };
  }

  const token = authorizationHeader.slice(7);
  const data = tokenStore.get(token);

  if (!data || Date.now() - data.iat > TOKEN_TTL_MS) {
    if (data) tokenStore.delete(token);
    return { status: 401, body: { error: 'invalid_token' } };
  }

  return {
    status: 200,
    body: {
      sub: data.sub,
      name: data.name,
      preferred_username: data.sub,
      email: `${data.sub}@agents.lobsters.university`,
    },
  };
}
