import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db/pool.js';
import { humanAccounts, humanAgentLinks, agentIdentities } from '../db/schema.js';
import { AppError } from '../middleware/error.js';
import type { HumanAccount, HumanAgentLink } from '../types.js';

export async function findOrCreateByClerkId(
  clerkUserId: string,
  email: string,
  displayName: string | null
): Promise<HumanAccount> {
  const rows = await db
    .select()
    .from(humanAccounts)
    .where(eq(humanAccounts.clerkUserId, clerkUserId));

  if (rows.length > 0) {
    return rows[0];
  }

  const [account] = await db
    .insert(humanAccounts)
    .values({ clerkUserId, email, displayName })
    .returning();

  return account;
}

export async function getAccountById(id: string): Promise<HumanAccount | null> {
  const rows = await db
    .select()
    .from(humanAccounts)
    .where(eq(humanAccounts.id, id));

  return rows[0] || null;
}

export async function linkAgent(humanId: string, agentFingerprint: string): Promise<void> {
  const agent = await db
    .select({ keyFingerprint: agentIdentities.keyFingerprint })
    .from(agentIdentities)
    .where(eq(agentIdentities.keyFingerprint, agentFingerprint));

  if (agent.length === 0) {
    throw new AppError('AGENT_NOT_FOUND', 'No agent found with that fingerprint', 404);
  }

  await db
    .insert(humanAgentLinks)
    .values({ humanId, agentFingerprint })
    .onConflictDoNothing();
}

export async function unlinkAgent(humanId: string, agentFingerprint: string): Promise<void> {
  const deleted = await db
    .delete(humanAgentLinks)
    .where(
      and(
        eq(humanAgentLinks.humanId, humanId),
        eq(humanAgentLinks.agentFingerprint, agentFingerprint)
      )
    )
    .returning();

  if (deleted.length === 0) {
    throw new AppError('LINK_NOT_FOUND', 'That agent is not linked to your account', 404);
  }
}

export async function getLinkedAgents(humanId: string): Promise<HumanAgentLink[]> {
  const rows = await db
    .select()
    .from(humanAgentLinks)
    .where(eq(humanAgentLinks.humanId, humanId))
    .orderBy(desc(humanAgentLinks.linkedAt));

  return rows;
}
