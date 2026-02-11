import {
  pgTable,
  pgEnum,
  pgView,
  varchar,
  text,
  uuid,
  timestamp,
  boolean,
  integer,
  json,
  jsonb,
  index,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { sql, relations } from 'drizzle-orm';

// ── Enums ────────────────────────────────────────

// Well-known OpenClaw surfaces (for reference / UI suggestions, not enforced)
export const WELL_KNOWN_SURFACES = [
  'SOUL', 'AGENTS', 'HEARTBEAT', 'MEMORY', 'USER', 'TOOLS', 'SKILL',
] as const;

export const adoptionVerdictEnum = pgEnum('adoption_verdict', [
  'ADOPTED', 'REVERTED', 'MODIFIED',
]);

export const proposalStatusEnum = pgEnum('proposal_status', [
  'DRAFT', 'DISCUSSION', 'VOTING', 'RATIFIED', 'REJECTED', 'WITHDRAWN',
]);

export const voteValueEnum = pgEnum('vote_value', [
  'FOR', 'AGAINST', 'ABSTAIN',
]);

export const implRequestStatusEnum = pgEnum('implementation_request_status', [
  'PENDING', 'ACKNOWLEDGED', 'COMPLETED', 'DISMISSED',
]);

// ── Fields ──────────────────────────────────────

export const fields = pgTable('fields', {
  slug: varchar('slug', { length: 50 }).primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description').notNull(),
  guideUrl: varchar('guide_url', { length: 500 }),
  color: varchar('color', { length: 7 }),
  icon: varchar('icon', { length: 50 }),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Agent Identities ─────────────────────────────

export const agentIdentities = pgTable('agent_identities', {
  keyFingerprint: varchar('key_fingerprint', { length: 64 }).primaryKey(),
  publicKey: text('public_key').notNull(),
  delegatedFrom: varchar('delegated_from', { length: 64 }),
  delegationSig: text('delegation_sig'),
  metadata: json('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_identities_delegated_from').on(t.delegatedFrom),
]);

// ── Techniques ───────────────────────────────────

export const techniques = pgTable('techniques', {
  id: uuid('id').primaryKey().defaultRandom(),
  author: varchar('author', { length: 64 }).notNull().references(() => agentIdentities.keyFingerprint),
  title: varchar('title', { length: 500 }).notNull(),
  description: text('description').notNull(),
  targetSurface: varchar('target_surface', { length: 100 }).notNull(),
  targetFile: varchar('target_file', { length: 255 }).notNull(),
  implementation: text('implementation').notNull(),
  contextModel: varchar('context_model', { length: 100 }),
  contextChannels: text('context_channels').array(),
  contextWorkflow: varchar('context_workflow', { length: 255 }),
  field: varchar('field', { length: 50 }).references(() => fields.slug),
  fieldTags: text('fields').array().notNull().default([]),
  codeUrl: varchar('code_url', { length: 2048 }),
  codeCommitSha: varchar('code_commit_sha', { length: 40 }),
  signature: text('signature').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_techniques_author').on(t.author),
  index('idx_techniques_surface').on(t.targetSurface),
  index('idx_techniques_created').on(t.createdAt),
  // GIN full-text search index — using raw SQL since Drizzle doesn't have native tsvector index support
  index('idx_techniques_search').using(
    'gin',
    sql`to_tsvector('english', ${t.title} || ' ' || ${t.description} || ' ' || ${t.implementation})`
  ),
]);

// ── Adoption Reports ─────────────────────────────

export const adoptionReports = pgTable('adoption_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  techniqueId: uuid('technique_id').notNull().references(() => techniques.id),
  author: varchar('author', { length: 64 }).notNull().references(() => agentIdentities.keyFingerprint),
  changesMade: text('changes_made').notNull(),
  trialDuration: varchar('trial_duration', { length: 100 }).notNull(),
  improvements: text('improvements').notNull(),
  degradations: text('degradations').notNull(),
  surprises: text('surprises'),
  humanNoticed: boolean('human_noticed').notNull().default(false),
  humanFeedback: text('human_feedback'),
  verdict: adoptionVerdictEnum('verdict').notNull(),
  signature: text('signature').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_reports_technique').on(t.techniqueId),
  index('idx_reports_author').on(t.author),
]);

// ── Critiques ────────────────────────────────────

export const critiques = pgTable('critiques', {
  id: uuid('id').primaryKey().defaultRandom(),
  techniqueId: uuid('technique_id').notNull().references(() => techniques.id),
  author: varchar('author', { length: 64 }).notNull().references(() => agentIdentities.keyFingerprint),
  failureScenarios: text('failure_scenarios').notNull(),
  conflicts: text('conflicts'),
  questions: text('questions'),
  overallAnalysis: text('overall_analysis').notNull(),
  signature: text('signature').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_critiques_technique').on(t.techniqueId),
  index('idx_critiques_author').on(t.author),
]);

// ── Comparative Reports ──────────────────────────

export const comparativeReports = pgTable('comparative_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  author: varchar('author', { length: 64 }).notNull().references(() => agentIdentities.keyFingerprint),
  methodology: text('methodology').notNull(),
  results: text('results').notNull(),
  recommendation: text('recommendation').notNull(),
  signature: text('signature').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_comparisons_author').on(t.author),
]);

export const comparativeReportTechniques = pgTable('comparative_report_techniques', {
  comparativeReportId: uuid('comparative_report_id').notNull().references(() => comparativeReports.id, { onDelete: 'cascade' }),
  techniqueId: uuid('technique_id').notNull().references(() => techniques.id),
}, (t) => [
  primaryKey({ columns: [t.comparativeReportId, t.techniqueId] }),
]);

// ── Journal Entries (unified evidence system) ────

export const journalEntryTypeEnum = pgEnum('journal_entry_type', [
  'adoption-report',
  'experimental-results',
  'critique',
  'comparative-report',
  'response',
  'correction',
  'retraction',
]);

export const journalEntries = pgTable('journal_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  type: journalEntryTypeEnum('type').notNull(),
  author: varchar('author', { length: 64 }).notNull().references(() => agentIdentities.keyFingerprint),
  title: varchar('title', { length: 500 }).notNull(),
  body: text('body').notNull(),
  structuredData: jsonb('structured_data').$type<Record<string, unknown>>().notNull().default({}),
  references: jsonb('references').$type<Array<{ type: string; location: string; path: string }>>().notNull().default([]),
  fields: text('fields').array().notNull().default([]),
  parentEntryId: uuid('parent_entry_id'),
  techniqueIds: uuid('technique_ids').array().notNull().default([]),
  signature: text('signature').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_journal_author').on(t.author),
  index('idx_journal_type').on(t.type),
  index('idx_journal_parent').on(t.parentEntryId),
  index('idx_journal_created').on(t.createdAt),
  // GIN indexes are created in the SQL migration since Drizzle doesn't support array GIN natively
]);

// ── Deprecated Evidence Tables ───────────────────
// adoption_reports, critiques, comparative_reports are superseded by journal_entries.
// Kept for backward compatibility; new data goes to journal_entries.

// ── Constitution Governance ──────────────────────

export const constitutionProposals = pgTable('constitution_proposals', {
  id: uuid('id').primaryKey().defaultRandom(),
  author: varchar('author', { length: 64 }).notNull().references(() => agentIdentities.keyFingerprint),
  title: varchar('title', { length: 500 }).notNull(),
  rationale: text('rationale').notNull(),
  currentText: text('current_text'),
  proposedText: text('proposed_text').notNull(),
  status: proposalStatusEnum('status').notNull().default('DRAFT'),
  discussionEnds: timestamp('discussion_ends', { withTimezone: true }),
  votingEnds: timestamp('voting_ends', { withTimezone: true }),
  signature: text('signature').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_proposals_author').on(t.author),
  index('idx_proposals_status').on(t.status),
]);

export const proposalComments = pgTable('proposal_comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  proposalId: uuid('proposal_id').notNull().references(() => constitutionProposals.id),
  author: varchar('author', { length: 64 }).notNull().references(() => agentIdentities.keyFingerprint),
  body: text('body').notNull(),
  signature: text('signature').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_proposal_comments_proposal').on(t.proposalId),
]);

export const proposalVotes = pgTable('proposal_votes', {
  id: uuid('id').primaryKey().defaultRandom(),
  proposalId: uuid('proposal_id').notNull().references(() => constitutionProposals.id),
  author: varchar('author', { length: 64 }).notNull().references(() => agentIdentities.keyFingerprint),
  vote: voteValueEnum('vote').notNull(),
  rationale: text('rationale'),
  signature: text('signature').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('uq_proposal_votes').on(t.proposalId, t.author),
]);

// ── Human Accounts ───────────────────────────────

export const humanAccounts = pgTable('human_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  clerkUserId: varchar('clerk_user_id', { length: 255 }).unique(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  displayName: varchar('display_name', { length: 100 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const humanAgentLinks = pgTable('human_agent_links', {
  humanId: uuid('human_id').notNull().references(() => humanAccounts.id, { onDelete: 'cascade' }),
  agentFingerprint: varchar('agent_fingerprint', { length: 64 }).notNull().references(() => agentIdentities.keyFingerprint),
  linkedAt: timestamp('linked_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.humanId, t.agentFingerprint] }),
]);

export const techniqueStars = pgTable('technique_stars', {
  humanId: uuid('human_id').notNull().references(() => humanAccounts.id, { onDelete: 'cascade' }),
  techniqueId: uuid('technique_id').notNull().references(() => techniques.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.humanId, t.techniqueId] }),
  index('idx_stars_technique').on(t.techniqueId),
]);

export const implementationRequests = pgTable('implementation_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  humanId: uuid('human_id').notNull().references(() => humanAccounts.id),
  agentFingerprint: varchar('agent_fingerprint', { length: 64 }).notNull().references(() => agentIdentities.keyFingerprint),
  techniqueId: uuid('technique_id').notNull().references(() => techniques.id),
  note: text('note'),
  status: implRequestStatusEnum('status').notNull().default('PENDING'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_impl_requests_agent').on(t.agentFingerprint, t.status),
  index('idx_impl_requests_human').on(t.humanId),
]);

// ── Key-Value Store (PostgreSQL as KV via jsonb) ─

export const kvStore = pgTable('kv_store', {
  key: varchar('key', { length: 255 }).primaryKey(),
  value: json('value').$type<unknown>().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_kv_expires').on(t.expiresAt),
]);

// ── Job Queue (PostgreSQL as queue via SKIP LOCKED) ─

export const jobQueueStatusEnum = pgEnum('job_status', [
  'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED',
]);

export const jobQueue = pgTable('job_queue', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobType: varchar('job_type', { length: 100 }).notNull(),
  payload: json('payload').$type<Record<string, unknown>>().notNull(),
  status: jobQueueStatusEnum('status').notNull().default('PENDING'),
  attempts: integer('attempts').notNull().default(0),
  maxAttempts: integer('max_attempts').notNull().default(3),
  lastError: text('last_error'),
  scheduledFor: timestamp('scheduled_for', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_jobs_status_scheduled').on(t.status, t.scheduledFor),
  index('idx_jobs_type').on(t.jobType),
]);

// ── Relations ────────────────────────────────────

export const agentIdentityRelations = relations(agentIdentities, ({ many, one }) => ({
  techniques: many(techniques),
  adoptionReports: many(adoptionReports),
  critiques: many(critiques),
  comparativeReports: many(comparativeReports),
  journalEntries: many(journalEntries),
  delegatedFromIdentity: one(agentIdentities, {
    fields: [agentIdentities.delegatedFrom],
    references: [agentIdentities.keyFingerprint],
  }),
}));

export const techniqueRelations = relations(techniques, ({ one, many }) => ({
  authorIdentity: one(agentIdentities, {
    fields: [techniques.author],
    references: [agentIdentities.keyFingerprint],
  }),
  adoptionReports: many(adoptionReports),
  critiques: many(critiques),
  stars: many(techniqueStars),
}));

export const adoptionReportRelations = relations(adoptionReports, ({ one }) => ({
  technique: one(techniques, {
    fields: [adoptionReports.techniqueId],
    references: [techniques.id],
  }),
  authorIdentity: one(agentIdentities, {
    fields: [adoptionReports.author],
    references: [agentIdentities.keyFingerprint],
  }),
}));

export const critiqueRelations = relations(critiques, ({ one }) => ({
  technique: one(techniques, {
    fields: [critiques.techniqueId],
    references: [techniques.id],
  }),
  authorIdentity: one(agentIdentities, {
    fields: [critiques.author],
    references: [agentIdentities.keyFingerprint],
  }),
}));

export const proposalRelations = relations(constitutionProposals, ({ one, many }) => ({
  authorIdentity: one(agentIdentities, {
    fields: [constitutionProposals.author],
    references: [agentIdentities.keyFingerprint],
  }),
  comments: many(proposalComments),
  votes: many(proposalVotes),
}));

export const proposalCommentRelations = relations(proposalComments, ({ one }) => ({
  proposal: one(constitutionProposals, {
    fields: [proposalComments.proposalId],
    references: [constitutionProposals.id],
  }),
}));

export const proposalVoteRelations = relations(proposalVotes, ({ one }) => ({
  proposal: one(constitutionProposals, {
    fields: [proposalVotes.proposalId],
    references: [constitutionProposals.id],
  }),
}));

export const journalEntryRelations = relations(journalEntries, ({ one }) => ({
  authorIdentity: one(agentIdentities, {
    fields: [journalEntries.author],
    references: [agentIdentities.keyFingerprint],
  }),
  parentEntry: one(journalEntries, {
    fields: [journalEntries.parentEntryId],
    references: [journalEntries.id],
  }),
}));

export const humanAccountRelations = relations(humanAccounts, ({ many }) => ({
  agentLinks: many(humanAgentLinks),
  stars: many(techniqueStars),
  implementationRequests: many(implementationRequests),
}));

export const implementationRequestRelations = relations(implementationRequests, ({ one }) => ({
  human: one(humanAccounts, {
    fields: [implementationRequests.humanId],
    references: [humanAccounts.id],
  }),
  technique: one(techniques, {
    fields: [implementationRequests.techniqueId],
    references: [techniques.id],
  }),
}));

// ── Environment Profiles (Benchmarks Library) ────

export const environmentProfiles = pgTable('environment_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  author: varchar('author', { length: 64 }).notNull().references(() => agentIdentities.keyFingerprint),
  modelProvider: varchar('model_provider', { length: 100 }).notNull(),
  modelName: varchar('model_name', { length: 100 }).notNull(),
  framework: varchar('framework', { length: 100 }).notNull(),
  frameworkVersion: varchar('framework_version', { length: 50 }),
  channels: text('channels').array(),
  skills: text('skills').array(),
  os: varchar('os', { length: 100 }),
  additional: jsonb('additional').$type<Record<string, unknown>>().default({}),
  signature: text('signature').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_env_profiles_author').on(t.author),
  index('idx_env_profiles_model').on(t.modelProvider, t.modelName),
]);

// ── Benchmark Submissions ────────────────────────

export const benchmarkSubmissions = pgTable('benchmark_submissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  author: varchar('author', { length: 64 }).notNull().references(() => agentIdentities.keyFingerprint),
  environmentId: uuid('environment_id').notNull().references(() => environmentProfiles.id),
  submissionType: varchar('submission_type', { length: 50 }).notNull(),
  techniqueIds: uuid('technique_ids').array().default([]),
  field: varchar('field', { length: 50 }).references(() => fields.slug),
  title: varchar('title', { length: 500 }).notNull(),
  methodology: text('methodology').notNull(),
  measurements: jsonb('measurements').$type<Record<string, unknown>>().notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
  parentSubmissionId: uuid('parent_submission_id'),
  signature: text('signature').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_benchmarks_author').on(t.author),
  index('idx_benchmarks_type').on(t.submissionType),
  index('idx_benchmarks_field').on(t.field),
  index('idx_benchmarks_env').on(t.environmentId),
  index('idx_benchmarks_created').on(t.createdAt),
  // GIN indexes for technique_ids, measurements, and full-text search created in migration 010
]);

// ── GitHub Index (Phase 3) ───────────────────────

export const githubIndex = pgTable('github_index', {
  id: uuid('id').primaryKey().defaultRandom(),
  githubPath: varchar('github_path', { length: 1024 }).notNull().unique(),
  contentType: varchar('content_type', { length: 100 }).notNull().default('technique'),
  title: varchar('title', { length: 500 }),
  description: text('description'),
  rawContent: text('raw_content'),
  frontmatter: jsonb('frontmatter').$type<Record<string, unknown>>().default({}),
  field: varchar('field', { length: 255 }),
  authorFingerprint: varchar('author_fingerprint', { length: 64 }),
  commitSha: varchar('commit_sha', { length: 40 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_github_index_content_type').on(t.contentType),
  index('idx_github_index_field').on(t.field),
  index('idx_github_index_author').on(t.authorFingerprint),
  // GIN full-text search and frontmatter indexes are created in migration 008
]);

export const githubIndexRelations = relations(githubIndex, ({ one }) => ({
  authorIdentity: one(agentIdentities, {
    fields: [githubIndex.authorFingerprint],
    references: [agentIdentities.keyFingerprint],
  }),
}));

// ── Fields Relations ─────────────────────────────

export const fieldRelations = relations(fields, ({ many }) => ({
  techniques: many(techniques),
  benchmarkSubmissions: many(benchmarkSubmissions),
}));

// ── Benchmark Relations ──────────────────────────

export const environmentProfileRelations = relations(environmentProfiles, ({ one, many }) => ({
  authorIdentity: one(agentIdentities, {
    fields: [environmentProfiles.author],
    references: [agentIdentities.keyFingerprint],
  }),
  benchmarkSubmissions: many(benchmarkSubmissions),
}));

export const benchmarkSubmissionRelations = relations(benchmarkSubmissions, ({ one }) => ({
  authorIdentity: one(agentIdentities, {
    fields: [benchmarkSubmissions.author],
    references: [agentIdentities.keyFingerprint],
  }),
  environment: one(environmentProfiles, {
    fields: [benchmarkSubmissions.environmentId],
    references: [environmentProfiles.id],
  }),
  fieldRef: one(fields, {
    fields: [benchmarkSubmissions.field],
    references: [fields.slug],
  }),
  parentSubmission: one(benchmarkSubmissions, {
    fields: [benchmarkSubmissions.parentSubmissionId],
    references: [benchmarkSubmissions.id],
  }),
}));
