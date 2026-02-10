import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted so the mock fn is available when vi.mock factory runs
const { mockPoolQuery, mockSearchPages } = vi.hoisted(() => ({
  mockPoolQuery: vi.fn(),
  mockSearchPages: vi.fn(),
}));

// Mock pool for raw SQL queries
vi.mock('../db/pool.js', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => []),
        orderBy: vi.fn(() => ({
          limit: vi.fn(() => ({
            offset: vi.fn(() => []),
          })),
        })),
      })),
    })),
  },
  pool: {
    query: mockPoolQuery,
  },
}));

// Mock wiki service
vi.mock('./wiki.js', () => ({
  searchPages: mockSearchPages,
}));

// Mock config
vi.mock('../config.js', () => ({
  config: {
    wikijs: {
      url: 'http://localhost:3001',
      graphqlEndpoint: 'http://localhost:3001/graphql',
      apiKey: 'test-key',
    },
  },
}));

import { search } from './search.js';

describe('search service', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock: return empty rows from pool queries
    mockPoolQuery.mockResolvedValue({ rows: [] });

    // Default wiki mock
    mockSearchPages.mockResolvedValue({
      results: [
        { id: '1', title: 'Wiki Page', description: 'A wiki page about testing', path: 'test/page', locale: 'en' },
      ],
      suggestions: [],
      totalHits: 1,
    });
  });

  it('returns empty results when no matches', async () => {
    mockSearchPages.mockResolvedValueOnce({ results: [], suggestions: [], totalHits: 0 });

    const result = await search('nonexistent-query-xyz');
    expect(result.results).toBeInstanceOf(Array);
    expect(result.total).toBeGreaterThanOrEqual(0);
  });

  it('searches techniques when library filter is "techniques"', async () => {
    mockPoolQuery.mockResolvedValueOnce({
      rows: [
        { id: 'abc-123', title: 'Test Technique', description: 'A test', target_surface: 'SOUL', rank: '0.5' },
      ],
    });

    const result = await search('test', { library: 'techniques' });

    expect(result.results.length).toBe(1);
    expect(result.results[0].library).toBe('techniques');
    expect(result.results[0].title).toBe('Test Technique');
    expect(result.results[0].url).toBe('/techniques/abc-123');
  });

  it('searches journal when library filter is "journal"', async () => {
    mockPoolQuery.mockResolvedValueOnce({
      rows: [
        { id: 'def-456', title: 'Test Entry', body: 'Journal body text', type: 'critique', rank: '0.3' },
      ],
    });

    const result = await search('test', { library: 'journal' });

    expect(result.results.length).toBe(1);
    expect(result.results[0].library).toBe('journal');
    expect(result.results[0].type).toBe('critique');
    expect(result.results[0].url).toBe('/journal/def-456');
  });

  it('searches wiki when library filter is "wiki"', async () => {
    const result = await search('test', { library: 'wiki' });

    expect(result.results.length).toBe(1);
    expect(result.results[0].library).toBe('wiki');
    expect(result.results[0].title).toBe('Wiki Page');
  });

  it('searches github when library filter is "github"', async () => {
    mockPoolQuery.mockResolvedValueOnce({
      rows: [
        { id: 'ghi-789', title: 'README', description: 'Repo readme', content_type: 'document', github_path: 'README.md', rank: '0.2' },
      ],
    });

    const result = await search('test', { library: 'github' });

    expect(result.results.length).toBe(1);
    expect(result.results[0].library).toBe('github');
    expect(result.results[0].title).toBe('README');
  });

  it('searches all libraries when no library filter', async () => {
    // techniques
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ id: 't1', title: 'Technique', description: 'desc', target_surface: 'SOUL', rank: '0.9' }],
    });
    // journal
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ id: 'j1', title: 'Entry', body: 'body', type: 'critique', rank: '0.5' }],
    });
    // github
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ id: 'g1', title: 'Doc', description: 'desc', content_type: 'document', github_path: 'doc.md', rank: '0.3' }],
    });

    const result = await search('test');

    // Should have results from techniques, journal, github, and wiki (4 sources)
    expect(result.results.length).toBe(4);
    // Should be sorted by relevance descending
    expect(result.results[0].relevance).toBeGreaterThanOrEqual(result.results[1].relevance);
  });

  it('respects limit and offset', async () => {
    // Return many results from techniques
    mockPoolQuery.mockResolvedValueOnce({
      rows: Array.from({ length: 10 }, (_, i) => ({
        id: `t${i}`, title: `Technique ${i}`, description: 'desc', target_surface: 'SOUL', rank: `${1 - i * 0.1}`,
      })),
    });

    const result = await search('test', { library: 'techniques', limit: 3, offset: 2 });

    expect(result.results.length).toBe(3);
    expect(result.total).toBe(10);
  });

  it('handles search with type and field filters', async () => {
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ id: 'j1', title: 'Entry', body: 'body', type: 'adoption-report', rank: '0.5' }],
    });

    const result = await search('test', { library: 'journal', type: 'adoption-report', field: 'heartbeat' });

    expect(result.results.length).toBe(1);
    expect(mockPoolQuery).toHaveBeenCalledTimes(1);
  });

  it('gracefully handles wiki failures', async () => {
    mockSearchPages.mockRejectedValueOnce(new Error('Wiki.js unavailable'));

    const result = await search('test', { library: 'wiki' });

    // Should not throw, just return empty
    expect(result.results).toEqual([]);
  });
});
