import { pool } from '../db/pool.js';
import * as wikiService from './wiki.js';
import { config } from '../config.js';

export interface SearchResult {
  library: 'techniques' | 'journal' | 'github' | 'wiki';
  id: string;
  title: string;
  snippet: string;
  type: string;
  url: string;
  relevance: number;
}

export interface SearchOptions {
  library?: string;
  type?: string;
  field?: string;
  limit?: number;
  offset?: number;
}

/**
 * Unified search across all libraries: techniques, journal_entries, github_index, and Wiki.js.
 * Queries all sources in parallel and merges results.
 */
export async function search(
  query: string,
  options: SearchOptions = {}
): Promise<{ results: SearchResult[]; total: number }> {
  const limit = Math.min(options.limit || 20, 100);
  const offset = options.offset || 0;

  const libraries = options.library
    ? [options.library]
    : ['techniques', 'journal', 'github', 'wiki'];

  const searches: Promise<SearchResult[]>[] = [];

  if (libraries.includes('techniques')) {
    searches.push(searchTechniques(query, options));
  }
  if (libraries.includes('journal')) {
    searches.push(searchJournal(query, options));
  }
  if (libraries.includes('github')) {
    searches.push(searchGithub(query, options));
  }
  if (libraries.includes('wiki')) {
    searches.push(searchWiki(query));
  }

  const resultArrays = await Promise.allSettled(searches);

  // Merge all fulfilled results, skip failures
  let allResults: SearchResult[] = [];
  for (const r of resultArrays) {
    if (r.status === 'fulfilled') {
      allResults = allResults.concat(r.value);
    }
  }

  // Sort by relevance descending
  allResults.sort((a, b) => b.relevance - a.relevance);

  const total = allResults.length;
  const paged = allResults.slice(offset, offset + limit);

  return { results: paged, total };
}

async function searchTechniques(query: string, options: SearchOptions): Promise<SearchResult[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (query) {
    conditions.push(
      `to_tsvector('english', title || ' ' || description || ' ' || implementation) @@ plainto_tsquery('english', $${paramIdx})`
    );
    params.push(query);
    paramIdx++;
  }

  if (options.field) {
    conditions.push(`target_surface = $${paramIdx}`);
    params.push(options.field);
    paramIdx++;
  }

  let sql = `SELECT id, title, description, target_surface,
    ts_rank(to_tsvector('english', title || ' ' || description || ' ' || implementation), plainto_tsquery('english', $1)) as rank
    FROM techniques`;

  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }

  sql += ' ORDER BY rank DESC LIMIT 50';

  const { rows } = await pool.query(sql, params);

  return rows.map((r: any) => ({
    library: 'techniques' as const,
    id: r.id,
    title: r.title,
    snippet: (r.description || '').slice(0, 200),
    type: r.target_surface || 'technique',
    url: `/techniques/${r.id}`,
    relevance: parseFloat(r.rank) || 0,
  }));
}

async function searchJournal(query: string, options: SearchOptions): Promise<SearchResult[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (query) {
    conditions.push(
      `to_tsvector('english', title || ' ' || body) @@ plainto_tsquery('english', $${paramIdx})`
    );
    params.push(query);
    paramIdx++;
  }

  if (options.type) {
    conditions.push(`type = $${paramIdx}`);
    params.push(options.type);
    paramIdx++;
  }

  if (options.field) {
    conditions.push(`$${paramIdx} = ANY(fields)`);
    params.push(options.field);
    paramIdx++;
  }

  let sql = `SELECT id, title, body, type,
    ts_rank(to_tsvector('english', title || ' ' || body), plainto_tsquery('english', $1)) as rank
    FROM journal_entries`;

  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }

  sql += ' ORDER BY rank DESC LIMIT 50';

  const { rows } = await pool.query(sql, params);

  return rows.map((r: any) => ({
    library: 'journal' as const,
    id: r.id,
    title: r.title,
    snippet: (r.body || '').slice(0, 200),
    type: r.type,
    url: `/journal/${r.id}`,
    relevance: parseFloat(r.rank) || 0,
  }));
}

async function searchGithub(query: string, options: SearchOptions): Promise<SearchResult[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (query) {
    conditions.push(
      `to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(description, '') || ' ' || COALESCE(raw_content, '')) @@ plainto_tsquery('english', $${paramIdx})`
    );
    params.push(query);
    paramIdx++;
  }

  if (options.type) {
    conditions.push(`content_type = $${paramIdx}`);
    params.push(options.type);
    paramIdx++;
  }

  if (options.field) {
    conditions.push(`field = $${paramIdx}`);
    params.push(options.field);
    paramIdx++;
  }

  let sql = `SELECT id, title, description, content_type, github_path,
    ts_rank(to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(description, '') || ' ' || COALESCE(raw_content, '')), plainto_tsquery('english', $1)) as rank
    FROM github_index`;

  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }

  sql += ' ORDER BY rank DESC LIMIT 50';

  const { rows } = await pool.query(sql, params);

  return rows.map((r: any) => ({
    library: 'github' as const,
    id: r.id,
    title: r.title || r.github_path,
    snippet: (r.description || '').slice(0, 200),
    type: r.content_type,
    url: `/v1/github/index/${r.github_path}`,
    relevance: parseFloat(r.rank) || 0,
  }));
}

async function searchWiki(query: string): Promise<SearchResult[]> {
  // Only attempt if Wiki.js is configured
  if (!config.wikijs.apiKey) {
    return [];
  }

  try {
    const wikiResults = await wikiService.searchPages(query);

    return wikiResults.results.map((r, idx) => ({
      library: 'wiki' as const,
      id: r.id,
      title: r.title,
      snippet: r.description || '',
      type: 'wiki-page',
      url: `${config.wikijs.url}/${r.path}`,
      relevance: (wikiResults.totalHits - idx) / Math.max(wikiResults.totalHits, 1),
    }));
  } catch {
    // Wiki.js may not be running — return empty
    return [];
  }
}
