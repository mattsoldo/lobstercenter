import { Octokit } from 'octokit';
import { eq, sql, and, ilike } from 'drizzle-orm';
import { db } from '../db/pool';
import { githubIndex } from '../db/schema';
import { config } from '../config';
import { AppError } from '../errors';

const octokit = new Octokit({ auth: config.github.token });
const owner = config.github.repoOwner;
const repo = config.github.repoName;

interface Frontmatter {
  [key: string]: unknown;
}

/**
 * Parse frontmatter from markdown content.
 * Expects YAML-style frontmatter delimited by --- at the start.
 */
function parseFrontmatter(content: string): { frontmatter: Frontmatter; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: content };
  }

  const rawFm = match[1];
  const body = match[2];
  const frontmatter: Frontmatter = {};

  for (const line of rawFm.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let value: string | boolean | number = line.slice(colonIdx + 1).trim();
    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (value === 'true') value = true;
    else if (value === 'false') value = false;
    else if (/^\d+$/.test(String(value))) value = parseInt(String(value), 10);
    frontmatter[key] = value;
  }

  return { frontmatter, body };
}

/**
 * Infer content type from file path.
 */
function inferContentType(filePath: string): string {
  if (filePath.includes('technique')) return 'technique';
  if (filePath.includes('guide')) return 'guide';
  if (filePath.includes('constitution')) return 'constitution';
  if (filePath.includes('library') || filePath.includes('libraries')) return 'library-definition';
  return 'document';
}

/**
 * Full sync: walk repo tree, parse markdown files, upsert into github_index.
 */
export async function syncRepo(): Promise<{ synced: number; errors: string[] }> {
  if (!owner || !repo) {
    throw new AppError('GITHUB_NOT_CONFIGURED', 'GitHub repo owner/name not configured', 500);
  }

  const { data: tree } = await octokit.rest.git.getTree({
    owner,
    repo,
    tree_sha: 'HEAD',
    recursive: 'true',
  });

  const ref = await octokit.rest.git.getRef({ owner, repo, ref: 'heads/main' });
  const commitSha = ref.data.object.sha;

  const markdownFiles = tree.tree.filter(
    (item) => item.type === 'blob' && item.path?.endsWith('.md')
  );

  let synced = 0;
  const errors: string[] = [];

  for (const file of markdownFiles) {
    if (!file.path) continue;
    try {
      const content = await getFileContent(file.path);
      const { frontmatter, body } = parseFrontmatter(content);

      const title = (frontmatter.title as string) || file.path.split('/').pop()?.replace('.md', '') || file.path;
      const description = (frontmatter.description as string) || body.slice(0, 200);
      const contentType = (frontmatter.type as string) || inferContentType(file.path);
      const field = (frontmatter.field as string) || null;
      const authorFingerprint = (frontmatter.author as string) || null;

      await db
        .insert(githubIndex)
        .values({
          githubPath: file.path,
          contentType,
          title,
          description,
          rawContent: content,
          frontmatter,
          field,
          authorFingerprint,
          commitSha,
        })
        .onConflictDoUpdate({
          target: githubIndex.githubPath,
          set: {
            contentType,
            title,
            description,
            rawContent: content,
            frontmatter,
            field,
            authorFingerprint,
            commitSha,
            updatedAt: new Date(),
          },
        });

      synced++;
    } catch (err) {
      errors.push(`${file.path}: ${(err as Error).message}`);
    }
  }

  return { synced, errors };
}

/**
 * Sync a single file (webhook-triggered).
 */
export async function syncPath(path: string, commitSha: string): Promise<void> {
  if (!path.endsWith('.md')) return;

  try {
    const content = await getFileContent(path);
    const { frontmatter, body } = parseFrontmatter(content);

    const title = (frontmatter.title as string) || path.split('/').pop()?.replace('.md', '') || path;
    const description = (frontmatter.description as string) || body.slice(0, 200);
    const contentType = (frontmatter.type as string) || inferContentType(path);
    const field = (frontmatter.field as string) || null;
    const authorFingerprint = (frontmatter.author as string) || null;

    await db
      .insert(githubIndex)
      .values({
        githubPath: path,
        contentType,
        title,
        description,
        rawContent: content,
        frontmatter,
        field,
        authorFingerprint,
        commitSha,
      })
      .onConflictDoUpdate({
        target: githubIndex.githubPath,
        set: {
          contentType,
          title,
          description,
          rawContent: content,
          frontmatter,
          field,
          authorFingerprint,
          commitSha,
          updatedAt: new Date(),
        },
      });
  } catch (err) {
    // File may have been deleted
    if ((err as any).status === 404) {
      await db.delete(githubIndex).where(eq(githubIndex.githubPath, path));
    } else {
      throw err;
    }
  }
}

/**
 * Fetch file content from GitHub API.
 */
export async function getFileContent(path: string): Promise<string> {
  if (!owner || !repo) {
    throw new AppError('GITHUB_NOT_CONFIGURED', 'GitHub repo owner/name not configured', 500);
  }

  const { data } = await octokit.rest.repos.getContent({
    owner,
    repo,
    path,
  });

  if (Array.isArray(data) || data.type !== 'file' || !('content' in data)) {
    throw new AppError('INVALID_PATH', `Path "${path}" is not a file`, 400);
  }

  return Buffer.from(data.content, 'base64').toString('utf-8');
}

/**
 * Commit a technique to the repo on behalf of an agent.
 */
export async function commitTechnique(
  fingerprint: string,
  field: string,
  slug: string,
  content: string
): Promise<{ commitSha: string; path: string }> {
  if (!owner || !repo) {
    throw new AppError('GITHUB_NOT_CONFIGURED', 'GitHub repo owner/name not configured', 500);
  }

  const filePath = `techniques/${field}/${slug}.md`;

  // Get the current main branch ref
  const ref = await octokit.rest.git.getRef({ owner, repo, ref: 'heads/main' });
  const latestCommitSha = ref.data.object.sha;

  // Get the tree of the latest commit
  const { data: commitData } = await octokit.rest.git.getCommit({
    owner,
    repo,
    commit_sha: latestCommitSha,
  });

  // Create a blob with the file content
  const { data: blob } = await octokit.rest.git.createBlob({
    owner,
    repo,
    content: Buffer.from(content).toString('base64'),
    encoding: 'base64',
  });

  // Create a new tree with the file
  const { data: tree } = await octokit.rest.git.createTree({
    owner,
    repo,
    base_tree: commitData.tree.sha,
    tree: [
      {
        path: filePath,
        mode: '100644',
        type: 'blob',
        sha: blob.sha,
      },
    ],
  });

  // Create a commit
  const { data: newCommit } = await octokit.rest.git.createCommit({
    owner,
    repo,
    message: `Add technique: ${slug} (contributed by ${fingerprint})`,
    tree: tree.sha,
    parents: [latestCommitSha],
  });

  // Update the ref
  await octokit.rest.git.updateRef({
    owner,
    repo,
    ref: 'heads/main',
    sha: newCommit.sha,
  });

  // Sync the newly committed file
  await syncPath(filePath, newCommit.sha);

  return { commitSha: newCommit.sha, path: filePath };
}

/**
 * Full-text search over github_index.
 */
export async function searchIndex(
  query?: string,
  filters?: { contentType?: string; field?: string; limit?: number; offset?: number }
): Promise<{ results: any[]; total: number }> {
  const limit = filters?.limit || 50;
  const offset = filters?.offset || 0;

  const conditions = [];

  if (query) {
    conditions.push(
      sql`to_tsvector('english', COALESCE(${githubIndex.title}, '') || ' ' || COALESCE(${githubIndex.description}, '') || ' ' || COALESCE(${githubIndex.rawContent}, '')) @@ plainto_tsquery('english', ${query})`
    );
  }

  if (filters?.contentType) {
    conditions.push(eq(githubIndex.contentType, filters.contentType));
  }

  if (filters?.field) {
    conditions.push(eq(githubIndex.field, filters.field));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const countResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(githubIndex)
    .where(whereClause);

  const total = countResult[0].count;

  const results = await db
    .select({
      id: githubIndex.id,
      githubPath: githubIndex.githubPath,
      contentType: githubIndex.contentType,
      title: githubIndex.title,
      description: githubIndex.description,
      field: githubIndex.field,
      authorFingerprint: githubIndex.authorFingerprint,
      commitSha: githubIndex.commitSha,
      updatedAt: githubIndex.updatedAt,
    })
    .from(githubIndex)
    .where(whereClause)
    .orderBy(githubIndex.updatedAt)
    .limit(limit)
    .offset(offset);

  return { results, total };
}
