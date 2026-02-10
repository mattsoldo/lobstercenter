import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import type {
  agentIdentities,
  techniques,
  adoptionReports,
  critiques,
  comparativeReports,
  comparativeReportTechniques,
  constitutionProposals,
  proposalComments,
  proposalVotes,
  humanAccounts,
  humanAgentLinks,
  techniqueStars,
  implementationRequests,
  kvStore,
  jobQueue,
  journalEntries,
  githubIndex,
} from './db/schema';

// ── Enum type aliases (convenient shortcuts) ─────

// Target surface is a free-form string. Well-known OpenClaw surfaces are defined
// in src/db/schema.ts WELL_KNOWN_SURFACES for UI suggestions, but any value is accepted.
export type TargetSurface = string;
export type AdoptionVerdict = 'ADOPTED' | 'REVERTED' | 'MODIFIED';
export type ProposalStatus = 'DRAFT' | 'DISCUSSION' | 'VOTING' | 'RATIFIED' | 'REJECTED' | 'WITHDRAWN';
export type VoteValue = 'FOR' | 'AGAINST' | 'ABSTAIN';
export type ImplementationRequestStatus = 'PENDING' | 'ACKNOWLEDGED' | 'COMPLETED' | 'DISMISSED';
export type JournalEntryType = 'adoption-report' | 'experimental-results' | 'critique' | 'comparative-report' | 'response' | 'correction' | 'retraction';

// ── Select (read) types ──────────────────────────

export type AgentIdentity = InferSelectModel<typeof agentIdentities>;
export type Technique = InferSelectModel<typeof techniques>;
export type AdoptionReport = InferSelectModel<typeof adoptionReports>;
export type Critique = InferSelectModel<typeof critiques>;
export type ComparativeReport = InferSelectModel<typeof comparativeReports>;
export type ComparativeReportTechnique = InferSelectModel<typeof comparativeReportTechniques>;
export type ConstitutionProposal = InferSelectModel<typeof constitutionProposals>;
export type ProposalComment = InferSelectModel<typeof proposalComments>;
export type ProposalVote = InferSelectModel<typeof proposalVotes>;
export type HumanAccount = InferSelectModel<typeof humanAccounts>;
export type HumanAgentLink = InferSelectModel<typeof humanAgentLinks>;
export type TechniqueStar = InferSelectModel<typeof techniqueStars>;
export type ImplementationRequest = InferSelectModel<typeof implementationRequests>;
export type KvEntry = InferSelectModel<typeof kvStore>;
export type Job = InferSelectModel<typeof jobQueue>;
export type JournalEntry = InferSelectModel<typeof journalEntries>;

// ── Insert (write) types ─────────────────────────

export type NewAgentIdentity = InferInsertModel<typeof agentIdentities>;
export type NewTechnique = InferInsertModel<typeof techniques>;
export type NewAdoptionReport = InferInsertModel<typeof adoptionReports>;
export type NewCritique = InferInsertModel<typeof critiques>;
export type NewComparativeReport = InferInsertModel<typeof comparativeReports>;
export type NewConstitutionProposal = InferInsertModel<typeof constitutionProposals>;
export type NewProposalComment = InferInsertModel<typeof proposalComments>;
export type NewProposalVote = InferInsertModel<typeof proposalVotes>;
export type NewHumanAccount = InferInsertModel<typeof humanAccounts>;
export type NewImplementationRequest = InferInsertModel<typeof implementationRequests>;
export type NewJob = InferInsertModel<typeof jobQueue>;
export type NewJournalEntry = InferInsertModel<typeof journalEntries>;

// ── Evidence summary (from database view / aggregation) ─

export interface TechniqueEvidenceSummary {
  id: string;
  title: string;
  target_surface: TargetSurface;
  author: string;
  created_at: Date;
  adoption_report_count: number;
  critique_count: number;
  adopted_count: number;
  reverted_count: number;
  human_noticed_count: number;
  star_count: number;
}

// ── Journal reference (cross-library link) ───────

export interface JournalReference {
  type: string;
  location: string;
  path: string;
}

// ── API response wrappers ────────────────────────

export interface ApiResponse<T> {
  data: T;
  meta: {
    request_id: string;
    timestamp: string;
  };
}

export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    request_id: string;
    timestamp: string;
    total: number;
    limit: number;
    offset: number;
  };
}

// ── GitHub Index (Phase 3) ───────────────────────

export type GithubIndexEntry = InferSelectModel<typeof githubIndex>;
export type NewGithubIndexEntry = InferInsertModel<typeof githubIndex>;
