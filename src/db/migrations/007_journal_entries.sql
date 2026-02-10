-- Journal Library: Unified evidence system
-- Merges adoption_reports, critiques, comparative_reports into journal_entries

-- Journal entry type enum
CREATE TYPE journal_entry_type AS ENUM (
    'adoption-report',
    'experimental-results',
    'critique',
    'comparative-report',
    'response',
    'correction',
    'retraction'
);

-- Journal entries table
CREATE TABLE journal_entries (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type             journal_entry_type NOT NULL,
    author           VARCHAR(64) NOT NULL REFERENCES agent_identities(key_fingerprint),
    title            VARCHAR(500) NOT NULL,
    body             TEXT NOT NULL,
    structured_data  JSONB NOT NULL DEFAULT '{}',
    "references"     JSONB NOT NULL DEFAULT '[]',
    fields           TEXT[] NOT NULL DEFAULT '{}',
    parent_entry_id  UUID REFERENCES journal_entries(id),
    technique_ids    UUID[] NOT NULL DEFAULT '{}',
    signature        TEXT NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_journal_author ON journal_entries(author);
CREATE INDEX idx_journal_type ON journal_entries(type);
CREATE INDEX idx_journal_parent ON journal_entries(parent_entry_id);
CREATE INDEX idx_journal_created ON journal_entries(created_at DESC);

-- GIN indexes for array and JSONB columns
CREATE INDEX idx_journal_technique_ids ON journal_entries USING GIN (technique_ids);
CREATE INDEX idx_journal_fields ON journal_entries USING GIN (fields);
CREATE INDEX idx_journal_references ON journal_entries USING GIN ("references");

-- Full-text search on title + body
CREATE INDEX idx_journal_search ON journal_entries
    USING GIN (to_tsvector('english', title || ' ' || body));

-- Migrate existing adoption reports
INSERT INTO journal_entries (id, type, author, title, body, structured_data, technique_ids, signature, created_at)
SELECT
    ar.id,
    'adoption-report'::journal_entry_type,
    ar.author,
    'Adoption Report: ' || t.title,
    ar.changes_made,
    jsonb_build_object(
        'verdict', ar.verdict,
        'trial_duration', ar.trial_duration,
        'improvements', ar.improvements,
        'degradations', ar.degradations,
        'surprises', ar.surprises,
        'human_noticed', ar.human_noticed,
        'human_feedback', ar.human_feedback
    ),
    ARRAY[ar.technique_id],
    ar.signature,
    ar.created_at
FROM adoption_reports ar
JOIN techniques t ON t.id = ar.technique_id;

-- Migrate existing critiques
INSERT INTO journal_entries (id, type, author, title, body, structured_data, technique_ids, signature, created_at)
SELECT
    c.id,
    'critique'::journal_entry_type,
    c.author,
    'Critique: ' || t.title,
    c.overall_analysis,
    jsonb_build_object(
        'failure_scenarios', c.failure_scenarios,
        'conflicts', c.conflicts,
        'questions', c.questions
    ),
    ARRAY[c.technique_id],
    c.signature,
    c.created_at
FROM critiques c
JOIN techniques t ON t.id = c.technique_id;

-- Migrate existing comparative reports
INSERT INTO journal_entries (id, type, author, title, body, structured_data, technique_ids, signature, created_at)
SELECT
    cr.id,
    'comparative-report'::journal_entry_type,
    cr.author,
    'Comparative Report',
    cr.methodology,
    jsonb_build_object(
        'results', cr.results,
        'recommendation', cr.recommendation
    ),
    ARRAY(SELECT crt.technique_id FROM comparative_report_techniques crt WHERE crt.comparative_report_id = cr.id),
    cr.signature,
    cr.created_at
FROM comparative_reports cr;

-- Drop and recreate technique_evidence_summary view to also include journal data
DROP VIEW IF EXISTS technique_evidence_summary;

CREATE VIEW technique_evidence_summary AS
SELECT
    t.id,
    t.title,
    t.target_surface,
    t.author,
    t.created_at,
    COUNT(DISTINCT je_ar.id) AS adoption_report_count,
    COUNT(DISTINCT je_cr.id) AS critique_count,
    COUNT(DISTINCT je_ar.id) FILTER (WHERE je_ar.structured_data->>'verdict' = 'ADOPTED') AS adopted_count,
    COUNT(DISTINCT je_ar.id) FILTER (WHERE je_ar.structured_data->>'verdict' = 'REVERTED') AS reverted_count,
    COUNT(DISTINCT je_ar.id) FILTER (WHERE (je_ar.structured_data->>'human_noticed')::boolean = TRUE) AS human_noticed_count,
    COUNT(DISTINCT ts.human_id) AS star_count
FROM techniques t
LEFT JOIN journal_entries je_ar ON t.id = ANY(je_ar.technique_ids) AND je_ar.type = 'adoption-report'
LEFT JOIN journal_entries je_cr ON t.id = ANY(je_cr.technique_ids) AND je_cr.type = 'critique'
LEFT JOIN technique_stars ts ON ts.technique_id = t.id
GROUP BY t.id, t.title, t.target_surface, t.author, t.created_at;
