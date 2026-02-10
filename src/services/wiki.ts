import { config } from '../config.js';

/**
 * Wiki.js GraphQL client.
 *
 * Wraps the Wiki.js GraphQL API for page operations.
 * Uses the configured API key for authentication.
 */

interface WikiPage {
  id: number;
  path: string;
  title: string;
  description: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

interface WikiPageListItem {
  id: number;
  path: string;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

interface WikiSearchResult {
  results: Array<{
    id: string;
    title: string;
    description: string;
    path: string;
    locale: string;
  }>;
  suggestions: string[];
  totalHits: number;
}

async function gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const response = await fetch(config.wikijs.graphqlEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.wikijs.apiKey}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Wiki.js GraphQL error (${response.status}): ${text}`);
  }

  const json = await response.json() as { data?: T; errors?: Array<{ message: string }> };

  if (json.errors && json.errors.length > 0) {
    throw new Error(`Wiki.js GraphQL error: ${json.errors[0].message}`);
  }

  return json.data as T;
}

/**
 * Get a page by its path.
 */
export async function getPage(path: string): Promise<WikiPage | null> {
  const data = await gql<{
    pages: {
      single: WikiPage | null;
    };
  }>(
    `query GetPage($path: String!) {
      pages {
        single(path: $path, locale: "en") {
          id
          path
          title
          description
          content
          createdAt
          updatedAt
        }
      }
    }`,
    { path }
  );

  return data.pages.single;
}

/**
 * Search pages by query string.
 */
export async function searchPages(query: string): Promise<WikiSearchResult> {
  const data = await gql<{
    pages: {
      search: WikiSearchResult;
    };
  }>(
    `query SearchPages($query: String!) {
      pages {
        search(query: $query) {
          results {
            id
            title
            description
            path
            locale
          }
          suggestions
          totalHits
        }
      }
    }`,
    { query }
  );

  return data.pages.search;
}

/**
 * List all pages.
 */
export async function listPages(): Promise<WikiPageListItem[]> {
  const data = await gql<{
    pages: {
      list: WikiPageListItem[];
    };
  }>(
    `query ListPages {
      pages {
        list(orderBy: UPDATED) {
          id
          path
          title
          description
          createdAt
          updatedAt
        }
      }
    }`
  );

  return data.pages.list;
}

/**
 * Create a new page.
 */
export async function createPage(params: {
  path: string;
  title: string;
  content: string;
  description?: string;
  tags?: string[];
}): Promise<{ id: number; path: string }> {
  const data = await gql<{
    pages: {
      create: {
        responseResult: { succeeded: boolean; errorCode: number; message: string };
        page: { id: number; path: string } | null;
      };
    };
  }>(
    `mutation CreatePage($content: String!, $description: String!, $editor: String!, $isPublished: Boolean!, $isPrivate: Boolean!, $locale: String!, $path: String!, $tags: [String]!, $title: String!) {
      pages {
        create(content: $content, description: $description, editor: $editor, isPublished: $isPublished, isPrivate: $isPrivate, locale: $locale, path: $path, tags: $tags, title: $title) {
          responseResult {
            succeeded
            errorCode
            message
          }
          page {
            id
            path
          }
        }
      }
    }`,
    {
      content: params.content,
      description: params.description || '',
      editor: 'markdown',
      isPublished: true,
      isPrivate: false,
      locale: 'en',
      path: params.path,
      tags: params.tags || [],
      title: params.title,
    }
  );

  const result = data.pages.create;
  if (!result.responseResult.succeeded) {
    throw new Error(`Failed to create page: ${result.responseResult.message}`);
  }

  return result.page!;
}

/**
 * Update an existing page.
 */
export async function updatePage(params: {
  id: number;
  content?: string;
  title?: string;
  description?: string;
  tags?: string[];
}): Promise<void> {
  const data = await gql<{
    pages: {
      update: {
        responseResult: { succeeded: boolean; errorCode: number; message: string };
      };
    };
  }>(
    `mutation UpdatePage($id: Int!, $content: String, $description: String, $tags: [String], $title: String) {
      pages {
        update(id: $id, content: $content, description: $description, tags: $tags, title: $title) {
          responseResult {
            succeeded
            errorCode
            message
          }
        }
      }
    }`,
    {
      id: params.id,
      content: params.content,
      title: params.title,
      description: params.description,
      tags: params.tags,
    }
  );

  const result = data.pages.update;
  if (!result.responseResult.succeeded) {
    throw new Error(`Failed to update page: ${result.responseResult.message}`);
  }
}

export type { WikiPage, WikiPageListItem, WikiSearchResult };
