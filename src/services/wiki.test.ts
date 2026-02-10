import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock config
vi.mock('../config.js', () => ({
  config: {
    wikijs: {
      url: 'http://localhost:3001',
      graphqlEndpoint: 'http://localhost:3001/graphql',
      apiKey: 'test-api-key',
    },
  },
}));

import { getPage, searchPages, listPages, createPage, updatePage } from './wiki.js';

function mockGqlResponse(data: unknown) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ data }),
  });
}

function mockGqlError(message: string) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ errors: [{ message }] }),
  });
}

describe('wiki service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getPage', () => {
    it('returns a page by path', async () => {
      const mockPage = {
        id: 1,
        path: 'home',
        title: 'Home',
        description: 'Welcome',
        content: '# Home',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      mockGqlResponse({ pages: { single: mockPage } });

      const result = await getPage('home');
      expect(result).toEqual(mockPage);
      expect(mockFetch).toHaveBeenCalledOnce();

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('http://localhost:3001/graphql');
      expect(options.headers['Authorization']).toBe('Bearer test-api-key');
    });

    it('returns null for a nonexistent page', async () => {
      mockGqlResponse({ pages: { single: null } });

      const result = await getPage('nonexistent');
      expect(result).toBeNull();
    });

    it('throws on GraphQL errors', async () => {
      mockGqlError('Page not found');

      await expect(getPage('broken')).rejects.toThrow('Wiki.js GraphQL error: Page not found');
    });
  });

  describe('searchPages', () => {
    it('returns search results', async () => {
      const mockResult = {
        results: [
          { id: '1', title: 'Home', description: 'Welcome', path: 'home', locale: 'en' },
        ],
        suggestions: [],
        totalHits: 1,
      };

      mockGqlResponse({ pages: { search: mockResult } });

      const result = await searchPages('home');
      expect(result.results).toHaveLength(1);
      expect(result.totalHits).toBe(1);
    });
  });

  describe('listPages', () => {
    it('returns a list of pages', async () => {
      const mockPages = [
        { id: 1, path: 'home', title: 'Home', description: '', createdAt: '', updatedAt: '' },
        { id: 2, path: 'about', title: 'About', description: '', createdAt: '', updatedAt: '' },
      ];

      mockGqlResponse({ pages: { list: mockPages } });

      const result = await listPages();
      expect(result).toHaveLength(2);
      expect(result[0].path).toBe('home');
    });
  });

  describe('createPage', () => {
    it('creates a page and returns id + path', async () => {
      mockGqlResponse({
        pages: {
          create: {
            responseResult: { succeeded: true, errorCode: 0, message: '' },
            page: { id: 42, path: 'new-page' },
          },
        },
      });

      const result = await createPage({
        path: 'new-page',
        title: 'New Page',
        content: '# Hello',
      });

      expect(result.id).toBe(42);
      expect(result.path).toBe('new-page');
    });

    it('throws when creation fails', async () => {
      mockGqlResponse({
        pages: {
          create: {
            responseResult: { succeeded: false, errorCode: 1, message: 'Duplicate path' },
            page: null,
          },
        },
      });

      await expect(
        createPage({ path: 'dup', title: 'Dup', content: 'x' })
      ).rejects.toThrow('Failed to create page: Duplicate path');
    });
  });

  describe('updatePage', () => {
    it('updates a page successfully', async () => {
      mockGqlResponse({
        pages: {
          update: {
            responseResult: { succeeded: true, errorCode: 0, message: '' },
          },
        },
      });

      await expect(
        updatePage({ id: 1, content: '# Updated' })
      ).resolves.toBeUndefined();
    });

    it('throws when update fails', async () => {
      mockGqlResponse({
        pages: {
          update: {
            responseResult: { succeeded: false, errorCode: 1, message: 'Not found' },
          },
        },
      });

      await expect(
        updatePage({ id: 999, content: 'x' })
      ).rejects.toThrow('Failed to update page: Not found');
    });
  });

  describe('fetch error handling', () => {
    it('throws on non-ok HTTP response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      });

      await expect(getPage('test')).rejects.toThrow('Wiki.js GraphQL error (500)');
    });
  });
});
