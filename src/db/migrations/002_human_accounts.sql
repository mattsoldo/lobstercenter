-- Human accounts and interactive features

CREATE TABLE human_accounts (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email            VARCHAR(255) NOT NULL UNIQUE,
    password_hash    TEXT NOT NULL,
    display_name     VARCHAR(100),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_human_accounts_email ON human_accounts(email);

-- Link humans to their agents
CREATE TABLE human_agent_links (
    human_id         UUID NOT NULL REFERENCES human_accounts(id) ON DELETE CASCADE,
    agent_fingerprint VARCHAR(64) NOT NULL REFERENCES agent_identities(key_fingerprint),
    linked_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (human_id, agent_fingerprint)
);

-- Stars (humans bookmarking techniques)
CREATE TABLE technique_stars (
    human_id         UUID NOT NULL REFERENCES human_accounts(id) ON DELETE CASCADE,
    technique_id     UUID NOT NULL REFERENCES techniques(id) ON DELETE CASCADE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (human_id, technique_id)
);

CREATE INDEX idx_stars_technique ON technique_stars(technique_id);

-- Implementation requests (human asks their agent to try a technique)
CREATE TYPE implementation_request_status AS ENUM ('PENDING', 'ACKNOWLEDGED', 'COMPLETED', 'DISMISSED');

CREATE TABLE implementation_requests (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    human_id         UUID NOT NULL REFERENCES human_accounts(id),
    agent_fingerprint VARCHAR(64) NOT NULL REFERENCES agent_identities(key_fingerprint),
    technique_id     UUID NOT NULL REFERENCES techniques(id),
    note             TEXT,
    status           implementation_request_status NOT NULL DEFAULT 'PENDING',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_impl_requests_agent ON implementation_requests(agent_fingerprint, status);
CREATE INDEX idx_impl_requests_human ON implementation_requests(human_id);

-- Session storage table (for connect-pg-simple)
CREATE TABLE session (
    sid    VARCHAR NOT NULL COLLATE "default",
    sess   JSON NOT NULL,
    expire TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (sid)
);

CREATE INDEX idx_session_expire ON session(expire);

-- Update the technique evidence summary to include star counts
DROP VIEW IF EXISTS technique_evidence_summary;
CREATE VIEW technique_evidence_summary AS
SELECT
    t.id,
    t.title,
    t.target_surface,
    t.author,
    t.created_at,
    COUNT(DISTINCT ar.id) AS adoption_report_count,
    COUNT(DISTINCT c.id) AS critique_count,
    COUNT(DISTINCT ar.id) FILTER (WHERE ar.verdict = 'ADOPTED') AS adopted_count,
    COUNT(DISTINCT ar.id) FILTER (WHERE ar.verdict = 'REVERTED') AS reverted_count,
    COUNT(DISTINCT ar.id) FILTER (WHERE ar.human_noticed = TRUE) AS human_noticed_count,
    COUNT(DISTINCT ts.human_id) AS star_count
FROM techniques t
LEFT JOIN adoption_reports ar ON ar.technique_id = t.id
LEFT JOIN critiques c ON c.technique_id = t.id
LEFT JOIN technique_stars ts ON ts.technique_id = t.id
GROUP BY t.id, t.title, t.target_surface, t.author, t.created_at;
