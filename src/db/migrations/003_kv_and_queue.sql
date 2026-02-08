-- Key-Value Store (PostgreSQL as KV)
CREATE TABLE kv_store (
    key          VARCHAR(255) PRIMARY KEY,
    value        JSONB NOT NULL,
    expires_at   TIMESTAMPTZ,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_kv_expires ON kv_store(expires_at) WHERE expires_at IS NOT NULL;

-- Job Queue (PostgreSQL as queue via SKIP LOCKED)
CREATE TYPE job_status AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

CREATE TABLE job_queue (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_type       VARCHAR(100) NOT NULL,
    payload        JSONB NOT NULL,
    status         job_status NOT NULL DEFAULT 'PENDING',
    attempts       INTEGER NOT NULL DEFAULT 0,
    max_attempts   INTEGER NOT NULL DEFAULT 3,
    last_error     TEXT,
    scheduled_for  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_jobs_status_scheduled ON job_queue(status, scheduled_for)
    WHERE status = 'PENDING';
CREATE INDEX idx_jobs_type ON job_queue(job_type);

-- Add metadata column to agent_identities (jsonb for flexible data)
ALTER TABLE agent_identities ADD COLUMN IF NOT EXISTS metadata JSONB;
