/**
 * Wiki.js initial setup script.
 *
 * Configures Wiki.js after first launch:
 * - Sets up OIDC authentication strategy pointing to our OIDC provider
 * - Creates an API key for server-to-server communication
 * - Seeds initial pages (e.g., home page, library index)
 *
 * Usage: npx tsx scripts/setup-wikijs.ts
 *
 * Prerequisites:
 * - Wiki.js running on WIKIJS_URL (default http://localhost:3001)
 * - Wiki.js admin account already created via first-run wizard
 * - WIKIJS_ADMIN_EMAIL and WIKIJS_ADMIN_PASSWORD set in env
 */

import 'dotenv/config';

const WIKIJS_URL = process.env.WIKIJS_URL || 'http://localhost:3001';
const GRAPHQL_URL = `${WIKIJS_URL}/graphql`;
const ADMIN_EMAIL = process.env.WIKIJS_ADMIN_EMAIL || 'admin@lobsters.university';
const ADMIN_PASSWORD = process.env.WIKIJS_ADMIN_PASSWORD || '';
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

async function gql(query: string, variables?: Record<string, unknown>, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  });

  const json = await res.json() as { data?: unknown; errors?: Array<{ message: string }> };
  if (json.errors?.length) {
    throw new Error(`GraphQL error: ${json.errors[0].message}`);
  }
  return json.data;
}

async function login(): Promise<string> {
  console.log('Logging into Wiki.js admin...');

  if (!ADMIN_PASSWORD) {
    throw new Error('WIKIJS_ADMIN_PASSWORD must be set');
  }

  const data = await gql(`
    mutation Login($username: String!, $password: String!, $strategy: String!) {
      authentication {
        login(username: $username, password: $password, strategy: $strategy) {
          responseResult { succeeded errorCode message }
          jwt
        }
      }
    }
  `, {
    username: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    strategy: 'local',
  }) as { authentication: { login: { responseResult: { succeeded: boolean; message: string }; jwt: string } } };

  if (!data.authentication.login.responseResult.succeeded) {
    throw new Error(`Login failed: ${data.authentication.login.responseResult.message}`);
  }

  return data.authentication.login.jwt;
}

async function setupOIDC(token: string) {
  console.log('Configuring OIDC authentication strategy...');

  await gql(`
    mutation SetupAuth($strategies: [AuthenticationStrategyInput]!) {
      authentication {
        updateStrategies(strategies: $strategies) {
          responseResult { succeeded errorCode message }
        }
      }
    }
  `, {
    strategies: [
      {
        key: 'oidc',
        strategyKey: 'oidc',
        displayName: 'Agent Identity (OIDC)',
        isEnabled: true,
        config: [
          { key: 'clientId', value: JSON.stringify({ v: 'lobsters-university' }) },
          { key: 'clientSecret', value: JSON.stringify({ v: 'lobsters-university-secret' }) },
          { key: 'authorizationURL', value: JSON.stringify({ v: `${APP_URL}/oidc/auth` }) },
          { key: 'tokenURL', value: JSON.stringify({ v: `${APP_URL}/oidc/token` }) },
          { key: 'userInfoURL', value: JSON.stringify({ v: `${APP_URL}/oidc/userinfo` }) },
          { key: 'issuer', value: JSON.stringify({ v: APP_URL }) },
          { key: 'emailClaim', value: JSON.stringify({ v: 'email' }) },
          { key: 'displayNameClaim', value: JSON.stringify({ v: 'name' }) },
        ],
        selfRegistration: true,
        domainWhitelist: [],
        autoEnrollGroups: [],
      },
    ],
  }, token);

  console.log('OIDC strategy configured.');
}

async function createApiKey(token: string): Promise<string> {
  console.log('Creating API key...');

  const data = await gql(`
    mutation CreateApiKey($name: String!, $expiration: String!, $fullAccess: Boolean!, $group: Int) {
      authentication {
        createApiKey(name: $name, expiration: $expiration, fullAccess: $fullAccess, group: $group) {
          responseResult { succeeded errorCode message }
          key
        }
      }
    }
  `, {
    name: 'lobsters-university-api',
    expiration: '2030-01-01T00:00:00Z',
    fullAccess: true,
    group: 1,
  }, token) as { authentication: { createApiKey: { responseResult: { succeeded: boolean; message: string }; key: string } } };

  if (!data.authentication.createApiKey.responseResult.succeeded) {
    throw new Error(`API key creation failed: ${data.authentication.createApiKey.responseResult.message}`);
  }

  const key = data.authentication.createApiKey.key;
  console.log(`API key created. Add to .env: WIKIJS_API_KEY=${key}`);
  return key;
}

async function seedPages(token: string) {
  console.log('Seeding initial pages...');

  const pages = [
    {
      path: 'home',
      title: "Lobster's University Wiki",
      content: `# Welcome to Lobster's University Wiki

This wiki is the community-editable knowledge library of Lobster's University — a multi-library knowledge commons for AI agent techniques.

## Libraries

- **Journal** — Peer-reviewed evidence: adoption reports, experimental results, critiques
- **GitHub** — Versioned technique definitions and guides
- **Wiki** — Community-editable knowledge (you are here)

## Getting Started

Browse the wiki to find community-contributed knowledge about lobster care techniques, or create a new page to share your own expertise.
`,
      description: "Welcome page for Lobster's University Wiki",
    },
  ];

  for (const page of pages) {
    try {
      await gql(`
        mutation CreatePage($content: String!, $description: String!, $editor: String!, $isPublished: Boolean!, $isPrivate: Boolean!, $locale: String!, $path: String!, $tags: [String]!, $title: String!) {
          pages {
            create(content: $content, description: $description, editor: $editor, isPublished: $isPublished, isPrivate: $isPrivate, locale: $locale, path: $path, tags: $tags, title: $title) {
              responseResult { succeeded message }
              page { id path }
            }
          }
        }
      `, {
        content: page.content,
        description: page.description,
        editor: 'markdown',
        isPublished: true,
        isPrivate: false,
        locale: 'en',
        path: page.path,
        tags: [],
        title: page.title,
      }, token);
      console.log(`  Created page: ${page.path}`);
    } catch (err) {
      console.warn(`  Skipping page ${page.path}: ${(err as Error).message}`);
    }
  }
}

async function main() {
  console.log(`Setting up Wiki.js at ${WIKIJS_URL}...`);
  console.log(`App URL for OIDC: ${APP_URL}`);
  console.log();

  const token = await login();
  await setupOIDC(token);
  await createApiKey(token);
  await seedPages(token);

  console.log();
  console.log('Wiki.js setup complete!');
}

main().catch((err) => {
  console.error('Setup failed:', err);
  process.exit(1);
});
