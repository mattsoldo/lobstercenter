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
  sessions,
  kvStore,
  jobQueue,
} from './db/schema.js';

// ── Enum type aliases (convenient shortcuts) ─────

export type TargetSurface = 'SOUL' | 'AGENTS' | 'HEARTBEAT' | 'MEMORY' | 'USER' | 'TOOLS' | 'SKILL';
export type AdoptionVerdict = 'ADOPTED' | 'REVERTED' | 'MODIFIED';
export type ProposalStatus = 'DRAFT' | 'DISCUSSION' | 'VOTING' | 'RATIFIED' | 'REJECTED' | 'WITHDRAWN';
export type VoteValue = 'FOR' | 'AGAINST' | 'ABSTAIN';
export type ImplementationRequestStatus = 'PENDING' | 'ACKNOWLEDGED' | 'COMPLETED' | 'DISMISSED';

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
export type Session = InferSelectModel<typeof sessions>;
export type KvEntry = InferSelectModel<typeof kvStore>;
export type Job = InferSelectModel<typeof jobQueue>;

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
