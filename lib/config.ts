function getDatabaseConfig(): { connectionString: string } | {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
} {
  const connStr = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (connStr) {
    return { connectionString: connStr };
  }

  return {
    host: process.env.DB_HOST || process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || process.env.POSTGRES_DATABASE || 'lobsters_university',
    user: process.env.DB_USER || process.env.POSTGRES_USER || 'postgres',
    password: process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD || 'postgres',
  };
}

export const config = {
  database: getDatabaseConfig(),
  rateLimit: {
    windowMs: 15 * 60 * 1000,
    maxWriteRequests: 30,
  },
  github: {
    repoOwner: process.env.GITHUB_REPO_OWNER || '',
    repoName: process.env.GITHUB_REPO_NAME || '',
    token: process.env.GITHUB_TOKEN || '',
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET || '',
  },
  wikijs: {
    url: process.env.WIKIJS_URL || 'http://localhost:3001',
    graphqlEndpoint: process.env.WIKIJS_GRAPHQL_ENDPOINT || 'http://localhost:3001/graphql',
    apiKey: process.env.WIKIJS_API_KEY || '',
  },
};
