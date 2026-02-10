import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock octokit before importing the module
vi.mock('octokit', () => {
  const mockOctokit = {
    rest: {
      git: {
        getTree: vi.fn(),
        getRef: vi.fn(),
        getCommit: vi.fn(),
        createBlob: vi.fn(),
        createTree: vi.fn(),
        createCommit: vi.fn(),
        updateRef: vi.fn(),
      },
      repos: {
        getContent: vi.fn(),
      },
    },
  };
  return { Octokit: vi.fn(() => mockOctokit) };
});

// Mock the database with full chaining support
vi.mock('../db/pool.js', () => {
  const chainable = (finalValue: unknown = []) => {
    const chain: any = {};
    const methods = ['from', 'where', 'orderBy', 'limit', 'offset', 'on', 'set', 'returning', 'values', 'onConflictDoUpdate'];
    for (const method of methods) {
      chain[method] = vi.fn(() => chain);
    }
    // Make the chain itself iterable / awaitable with the final value
    chain.then = (resolve: any) => resolve(finalValue);
    return chain;
  };
  return {
    db: {
      insert: vi.fn(() => chainable()),
      select: vi.fn(() => chainable([{ count: 0 }])),
      delete: vi.fn(() => chainable()),
    },
  };
});

// Mock config
vi.mock('../config.js', () => ({
  config: {
    github: {
      repoOwner: 'test-owner',
      repoName: 'test-repo',
      token: 'test-token',
      webhookSecret: 'test-secret',
    },
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
}));

describe('GitHub service', () => {
  describe('parseFrontmatter (via syncPath behavior)', () => {
    it('module loads without errors', async () => {
      // Importing the module to verify it loads correctly
      const mod = await import('./github.js');
      expect(mod).toBeDefined();
      expect(mod.syncRepo).toBeTypeOf('function');
      expect(mod.syncPath).toBeTypeOf('function');
      expect(mod.getFileContent).toBeTypeOf('function');
      expect(mod.commitTechnique).toBeTypeOf('function');
      expect(mod.searchIndex).toBeTypeOf('function');
    });
  });

  describe('searchIndex', () => {
    it('accepts optional query and filters', async () => {
      const { searchIndex } = await import('./github.js');
      // searchIndex calls db.select which is mocked
      const result = await searchIndex(undefined, { limit: 10, offset: 0 });
      expect(result).toBeDefined();
    });
  });
});
