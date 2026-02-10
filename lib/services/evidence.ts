import { eq, desc } from 'drizzle-orm';
import { db } from '../db/pool';
import { adoptionReports, critiques, comparativeReports, comparativeReportTechniques, techniques } from '../db/schema';
import { AppError } from '../errors';
import type { AdoptionReport, Critique, ComparativeReport, AdoptionVerdict } from '../types';

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
  await assertTechniqueExists(techniqueId);
  validateReportFields(input);

  const [report] = await db
    .insert(adoptionReports)
    .values({
      techniqueId,
      author: input.author,
      changesMade: input.changes_made,
      trialDuration: input.trial_duration,
      improvements: input.improvements,
      degradations: input.degradations,
      surprises: input.surprises || null,
      humanNoticed: input.human_noticed,
      humanFeedback: input.human_feedback || null,
      verdict: input.verdict,
      signature: input.signature,
    })
    .returning();

  return report as unknown as AdoptionReport;
}

/**
 * Submit a critique for a technique.
 */
export async function createCritique(techniqueId: string, input: CreateCritiqueInput): Promise<Critique> {
  await assertTechniqueExists(techniqueId);
  validateCritiqueFields(input);

  const [critique] = await db
    .insert(critiques)
    .values({
      techniqueId,
      author: input.author,
      failureScenarios: input.failure_scenarios,
      conflicts: input.conflicts || null,
      questions: input.questions || null,
      overallAnalysis: input.overall_analysis,
      signature: input.signature,
    })
    .returning();

  return critique as unknown as Critique;
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

  const result = await db.transaction(async (tx) => {
    const [report] = await tx
      .insert(comparativeReports)
      .values({
        author: input.author,
        methodology: input.methodology,
        results: input.results,
        recommendation: input.recommendation,
        signature: input.signature,
      })
      .returning();

    // Insert join table rows
    for (const tid of input.technique_ids) {
      await tx
        .insert(comparativeReportTechniques)
        .values({
          comparativeReportId: report.id,
          techniqueId: tid,
        });
    }

    return { ...report, technique_ids: input.technique_ids };
  });

  return result as unknown as ComparativeReport & { technique_ids: string[] };
}

/**
 * Get all evidence for a technique: adoption reports, critiques, and comparisons.
 */
export async function getEvidence(techniqueId: string) {
  await assertTechniqueExists(techniqueId);

  const [reports, critiqueRows, compJoinRows] = await Promise.all([
    db
      .select()
      .from(adoptionReports)
      .where(eq(adoptionReports.techniqueId, techniqueId))
      .orderBy(desc(adoptionReports.createdAt)),
    db
      .select()
      .from(critiques)
      .where(eq(critiques.techniqueId, techniqueId))
      .orderBy(desc(critiques.createdAt)),
    db
      .select({ comparativeReportId: comparativeReportTechniques.comparativeReportId })
      .from(comparativeReportTechniques)
      .where(eq(comparativeReportTechniques.techniqueId, techniqueId)),
  ]);

  // Fetch full comparative reports and enrich with technique_ids
  const compIds = [...new Set(compJoinRows.map((r) => r.comparativeReportId))];

  const enrichedComparisons = await Promise.all(
    compIds.map(async (compId) => {
      const [report] = await db
        .select()
        .from(comparativeReports)
        .where(eq(comparativeReports.id, compId));

      const tids = await db
        .select({ techniqueId: comparativeReportTechniques.techniqueId })
        .from(comparativeReportTechniques)
        .where(eq(comparativeReportTechniques.comparativeReportId, compId));

      return { ...report, technique_ids: tids.map((r) => r.techniqueId) };
    })
  );

  // Sort comparisons by created_at descending to match original behavior
  enrichedComparisons.sort((a, b) => {
    const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return dateB - dateA;
  });

  return {
    reports,
    critiques: critiqueRows,
    comparisons: enrichedComparisons,
  };
}

async function assertTechniqueExists(techniqueId: string) {
  const rows = await db
    .select({ id: techniques.id })
    .from(techniques)
    .where(eq(techniques.id, techniqueId))
    .limit(1);

  if (rows.length === 0) {
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
