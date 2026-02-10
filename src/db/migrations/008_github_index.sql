-- Migration 008: GitHub Index table for indexing GitHub repository content
-- Part of Phase 3: GitHub Library Integration

CREATE TABLE IF NOT EXISTS github_index (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  github_path VARCHAR(1024) NOT NULL UNIQUE,
  content_type VARCHAR(100) NOT NULL DEFAULT 'technique',
  title VARCHAR(500),
  description TEXT,
  raw_content TEXT,
  frontmatter JSONB DEFAULT '{}',
  field VARCHAR(255),
  author_fingerprint VARCHAR(64),
  commit_sha VARCHAR(40),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- GIN full-text search index on title + description + raw_content
CREATE INDEX idx_github_index_search ON github_index USING gin(
  to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(description, '') || ' ' || COALESCE(raw_content, ''))
);

-- GIN index on frontmatter for JSONB queries
CREATE INDEX idx_github_index_frontmatter ON github_index USING gin(frontmatter);

-- B-tree indexes for common queries
CREATE INDEX idx_github_index_content_type ON github_index (content_type);
CREATE INDEX idx_github_index_field ON github_index (field);
CREATE INDEX idx_github_index_author ON github_index (author_fingerprint);
