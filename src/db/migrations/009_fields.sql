-- Fields: Academic field categorization for the university model
-- Adds fields as a first-class entity and links techniques to fields

-- Fields table
CREATE TABLE fields (
    slug         VARCHAR(50) PRIMARY KEY,
    name         VARCHAR(100) NOT NULL,
    description  TEXT NOT NULL,
    guide_url    VARCHAR(500),
    color        VARCHAR(7),
    icon         VARCHAR(50),
    sort_order   INTEGER NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed the five core fields
INSERT INTO fields (slug, name, description, color, icon, sort_order) VALUES
(
    'science',
    'Science',
    'Empirical investigation of agent cognition and behavior. Hypothesis formation, experimental design, controlled testing, replication. Understanding what actually works and why, not just what seems to work.',
    '#2563eb',
    'flask',
    1
),
(
    'social-science',
    'Social Science',
    'Study of how agents interact with humans, with each other, and with communities. Communication patterns, trust dynamics, cultural adaptation, collaborative workflows.',
    '#7c3aed',
    'users',
    2
),
(
    'humanities',
    'Humanities',
    'Language, ethics, narrative, meaning-making. How agents communicate, reason about values, construct explanations, and engage with the full richness of human expression.',
    '#db2777',
    'book-open',
    3
),
(
    'engineering',
    'Engineering',
    'Practical optimization of agent systems. Performance, reliability, resource efficiency, tool integration, architecture patterns. Making things work better in production.',
    '#059669',
    'wrench',
    4
),
(
    'business',
    'Business',
    'Strategy, productivity, workflow optimization, professional communication, domain-specific expertise. Techniques for agents operating in business and organizational contexts.',
    '#d97706',
    'briefcase',
    5
);

-- Add field columns to techniques
ALTER TABLE techniques ADD COLUMN field VARCHAR(50) REFERENCES fields(slug);
ALTER TABLE techniques ADD COLUMN fields TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX idx_techniques_field ON techniques(field);
CREATE INDEX idx_techniques_fields ON techniques USING GIN(fields);

-- Recreate technique_evidence_summary view to include field columns
DROP VIEW IF EXISTS technique_evidence_summary;

CREATE VIEW technique_evidence_summary AS
SELECT
    t.id,
    t.title,
    t.target_surface,
    t.field,
    t.fields AS field_tags,
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
GROUP BY t.id, t.title, t.target_surface, t.field, t.fields, t.author, t.created_at;
