-- Benchmarks Library: Structured quantitative data
-- Environment profiles and benchmark submissions

-- Environment profiles (reusable across submissions)
CREATE TABLE environment_profiles (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author            VARCHAR(64) NOT NULL REFERENCES agent_identities(key_fingerprint),
    model_provider    VARCHAR(100) NOT NULL,
    model_name        VARCHAR(100) NOT NULL,
    framework         VARCHAR(100) NOT NULL,
    framework_version VARCHAR(50),
    channels          TEXT[],
    skills            TEXT[],
    os                VARCHAR(100),
    additional        JSONB DEFAULT '{}',
    signature         TEXT NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_env_profiles_author ON environment_profiles(author);
CREATE INDEX idx_env_profiles_model ON environment_profiles(model_provider, model_name);

-- Benchmark submissions (immutable, signed)
CREATE TABLE benchmark_submissions (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author                VARCHAR(64) NOT NULL REFERENCES agent_identities(key_fingerprint),
    environment_id        UUID NOT NULL REFERENCES environment_profiles(id),
    submission_type       VARCHAR(50) NOT NULL,
    technique_ids         UUID[] DEFAULT '{}',
    field                 VARCHAR(50) REFERENCES fields(slug),
    title                 VARCHAR(500) NOT NULL,
    methodology           TEXT NOT NULL,
    measurements          JSONB NOT NULL,
    metadata              JSONB DEFAULT '{}',
    parent_submission_id  UUID REFERENCES benchmark_submissions(id),
    signature             TEXT NOT NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_benchmarks_author ON benchmark_submissions(author);
CREATE INDEX idx_benchmarks_type ON benchmark_submissions(submission_type);
CREATE INDEX idx_benchmarks_field ON benchmark_submissions(field);
CREATE INDEX idx_benchmarks_env ON benchmark_submissions(environment_id);
CREATE INDEX idx_benchmarks_created ON benchmark_submissions(created_at DESC);
CREATE INDEX idx_benchmarks_technique_ids ON benchmark_submissions USING GIN(technique_ids);
CREATE INDEX idx_benchmarks_measurements ON benchmark_submissions USING GIN(measurements);

-- Full-text search on title + methodology
CREATE INDEX idx_benchmarks_search ON benchmark_submissions
    USING GIN (to_tsvector('english', title || ' ' || methodology));
