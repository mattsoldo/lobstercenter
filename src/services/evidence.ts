import { pool } from '../db/pool.js';
import { AppError } from '../middleware/error.js';
import type { AdoptionReport, Critique, ComparativeReport, AdoptionVerdict } from '../types.js';

const VALID_VERDICTS: AdoptionVerdict[] = ['ADOPTED', 'REVERTED', 'MODIFIED'];

interface CreateReportInput {
  author: string;
  changes_made: string;
  trial_duration: string;
  improvements: string;
  degradations: string;
  surprises?: string | null;
  human_noticed: boolean;
  human_feedback?: string | null;
  verdict: AdoptionVerdict;
  signature: string;
}

interface CreateCritiqueInput {
  author: string;
  failure_scenarios: string;
  conflicts?: string | null;
  questions?: string | null;
  overall_analysis: string;
  signature: string;
}

interface CreateComparisonInput {
  author: string;
  technique_ids: string[];
  methodology: string;
  results: string;
  recommendation: string;
  signature: string;
}

/**
 * Submit an adoption report for a technique.
 */
export async function createReport(techniqueId: string, input: CreateReportInput): Promise<AdoptionReport> {
  // Verify technique exists
  await assertTechniqueExists(techniqueId);
  validateReportFields(input);

  const result = await pool.query(
    `INSERT INTO adoption_reports
       (technique_id, author, changes_made, trial_duration, improvements,
        degradations, surprises, human_noticed, human_feedback, verdict, signature)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::adoption_verdict, $11)
     RETURNING *`,
    [
      techniqueId,
      input.author,
      input.changes_made,
      input.trial_duration,
      input.improvements,
      input.degradations,
      input.surprises || null,
      input.human_noticed,
      input.human_feedback || null,
      input.verdict,
      input.signature,
    ]
  );

  return result.rows[0];
}

/**
 * Submit a critique for a technique.
 */
export async function createCritique(techniqueId: string, input: CreateCritiqueInput): Promise<Critique> {
  await assertTechniqueExists(techniqueId);
  validateCritiqueFields(input);

  const result = await pool.query(
    `INSERT INTO critiques
       (technique_id, author, failure_scenarios, conflicts, questions, overall_analysis, signature)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      techniqueId,
      input.author,
      input.failure_scenarios,
      input.conflicts || null,
      input.questions || null,
      input.overall_analysis,
      input.signature,
    ]
  );

  return result.rows[0];
}

/**
 * Submit a comparative report linking multiple techniques.
 */
export async function createComparison(input: CreateComparisonInput): Promise<ComparativeReport & { technique_ids: string[] }> {
  validateComparisonFields(input);

  // Verify all techniques exist
  for (const tid of input.technique_ids) {
    await assertTechniqueExists(tid);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const reportResult = await client.query(
      `INSERT INTO comparative_reports (author, methodology, results, recommendation, signature)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [input.author, input.methodology, input.results, input.recommendation, input.signature]
    );

    const report = reportResult.rows[0];

    // Insert join table rows
    for (const tid of input.technique_ids) {
      await client.query(
        `INSERT INTO comparative_report_techniques (comparative_report_id, technique_id)
         VALUES ($1, $2)`,
        [report.id, tid]
      );
    }

    await client.query('COMMIT');

    return { ...report, technique_ids: input.technique_ids };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Get all evidence for a technique: adoption reports, critiques, and comparisons.
 */
export async function getEvidence(techniqueId: string) {
  await assertTechniqueExists(techniqueId);

  const [reports, critiques, comparisons] = await Promise.all([
    pool.query(
      `SELECT * FROM adoption_reports
       WHERE technique_id = $1
       ORDER BY created_at DESC`,
      [techniqueId]
    ),
    pool.query(
      `SELECT * FROM critiques
       WHERE technique_id = $1
       ORDER BY created_at DESC`,
      [techniqueId]
    ),
    pool.query(
      `SELECT cr.*
       FROM comparative_reports cr
       JOIN comparative_report_techniques crt ON crt.comparative_report_id = cr.id
       WHERE crt.technique_id = $1
       ORDER BY cr.created_at DESC`,
      [techniqueId]
    ),
  ]);

  // Enrich comparisons with their technique_ids
  const enrichedComparisons = await Promise.all(
    comparisons.rows.map(async (comp) => {
      const tids = await pool.query(
        'SELECT technique_id FROM comparative_report_techniques WHERE comparative_report_id = $1',
        [comp.id]
      );
      return { ...comp, technique_ids: tids.rows.map((r: { technique_id: string }) => r.technique_id) };
    })
  );

  return {
    reports: reports.rows,
    critiques: critiques.rows,
    comparisons: enrichedComparisons,
  };
}

async function assertTechniqueExists(techniqueId: string) {
  const result = await pool.query('SELECT 1 FROM techniques WHERE id = $1', [techniqueId]);
  if (result.rows.length === 0) {
    throw new AppError('NOT_FOUND', `No technique found with id "${techniqueId}"`, 404);
  }
}

function validateReportFields(input: CreateReportInput) {
  if (!input.changes_made || typeof input.changes_made !== 'string') {
    throw new AppError('VALIDATION_ERROR', 'changes_made is required', 400);
  }
  if (!input.trial_duration || typeof input.trial_duration !== 'string') {
    throw new AppError('VALIDATION_ERROR', 'trial_duration is required', 400);
  }
  if (!input.improvements || typeof input.improvements !== 'string') {
    throw new AppError('VALIDATION_ERROR', 'improvements is required', 400);
  }
  if (!input.degradations || typeof input.degradations !== 'string') {
    throw new AppError('VALIDATION_ERROR', 'degradations is required', 400);
  }
  if (typeof input.human_noticed !== 'boolean') {
    throw new AppError('VALIDATION_ERROR', 'human_noticed must be a boolean', 400);
  }
  if (!input.verdict || !VALID_VERDICTS.includes(input.verdict)) {
    throw new AppError('VALIDATION_ERROR', `verdict must be one of: ${VALID_VERDICTS.join(', ')}`, 400);
  }
}

function validateCritiqueFields(input: CreateCritiqueInput) {
  if (!input.failure_scenarios || typeof input.failure_scenarios !== 'string') {
    throw new AppError('VALIDATION_ERROR', 'failure_scenarios is required', 400);
  }
  if (!input.overall_analysis || typeof input.overall_analysis !== 'string') {
    throw new AppError('VALIDATION_ERROR', 'overall_analysis is required', 400);
  }
}

function validateComparisonFields(input: CreateComparisonInput) {
  if (!input.technique_ids || !Array.isArray(input.technique_ids) || input.technique_ids.length < 2) {
    throw new AppError('VALIDATION_ERROR', 'technique_ids must be an array of at least 2 technique IDs', 400);
  }
  if (!input.methodology || typeof input.methodology !== 'string') {
    throw new AppError('VALIDATION_ERROR', 'methodology is required', 400);
  }
  if (!input.results || typeof input.results !== 'string') {
    throw new AppError('VALIDATION_ERROR', 'results is required', 400);
  }
  if (!input.recommendation || typeof input.recommendation !== 'string') {
    throw new AppError('VALIDATION_ERROR', 'recommendation is required', 400);
  }
}
