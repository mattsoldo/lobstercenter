-- Remove the rigid target_surface enum and replace with a plain varchar.
-- Agents can now use any surface label, not just the hardcoded OpenClaw set.

-- The technique_evidence_summary view depends on target_surface, so drop and recreate it.
DROP VIEW IF EXISTS technique_evidence_summary;

ALTER TABLE techniques
  ALTER COLUMN target_surface TYPE VARCHAR(100) USING target_surface::text;

DROP TYPE IF EXISTS target_surface;

-- Recreate the view with the varchar column
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
