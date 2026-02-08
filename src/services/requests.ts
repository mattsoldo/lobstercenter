import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db/pool.js';
import { implementationRequests, humanAgentLinks, techniques } from '../db/schema.js';
import { AppError } from '../middleware/error.js';
import type { ImplementationRequest, ImplementationRequestStatus } from '../types.js';

export async function createRequest(
  humanId: string,
  techniqueId: string,
  agentFingerprint: string,
  note: string | null
): Promise<ImplementationRequest> {
  // Verify the agent is linked to this human
  const link = await db
    .select({ humanId: humanAgentLinks.humanId })
    .from(humanAgentLinks)
    .where(
      and(
        eq(humanAgentLinks.humanId, humanId),
        eq(humanAgentLinks.agentFingerprint, agentFingerprint)
      )
    );

  if (link.length === 0) {
    throw new AppError('AGENT_NOT_LINKED', 'That agent is not linked to your account', 403);
  }

  // Verify technique exists
  const technique = await db
    .select({ id: techniques.id })
    .from(techniques)
    .where(eq(techniques.id, techniqueId));

  if (technique.length === 0) {
    throw new AppError('TECHNIQUE_NOT_FOUND', 'Technique not found', 404);
  }

  const [request] = await db
    .insert(implementationRequests)
    .values({ humanId, agentFingerprint, techniqueId, note })
    .returning();

  return request;
}

export async function getRequestsByHuman(humanId: string): Promise<ImplementationRequest[]> {
  const rows = await db
    .select({
      id: implementationRequests.id,
      humanId: implementationRequests.humanId,
      agentFingerprint: implementationRequests.agentFingerprint,
      techniqueId: implementationRequests.techniqueId,
      note: implementationRequests.note,
      status: implementationRequests.status,
      createdAt: implementationRequests.createdAt,
      updatedAt: implementationRequests.updatedAt,
      techniqueTitle: techniques.title,
      targetSurface: techniques.targetSurface,
    })
    .from(implementationRequests)
    .innerJoin(techniques, eq(techniques.id, implementationRequests.techniqueId))
    .where(eq(implementationRequests.humanId, humanId))
    .orderBy(desc(implementationRequests.createdAt));

  return rows as ImplementationRequest[];
}

export async function getRequestsForAgent(
  agentFingerprint: string,
  status?: ImplementationRequestStatus
): Promise<ImplementationRequest[]> {
  const conditions = [eq(implementationRequests.agentFingerprint, agentFingerprint)];

  if (status) {
    conditions.push(eq(implementationRequests.status, status));
  }

  const rows = await db
    .select({
      id: implementationRequests.id,
      humanId: implementationRequests.humanId,
      agentFingerprint: implementationRequests.agentFingerprint,
      techniqueId: implementationRequests.techniqueId,
      note: implementationRequests.note,
      status: implementationRequests.status,
      createdAt: implementationRequests.createdAt,
      updatedAt: implementationRequests.updatedAt,
      techniqueTitle: techniques.title,
      targetSurface: techniques.targetSurface,
    })
    .from(implementationRequests)
    .innerJoin(techniques, eq(techniques.id, implementationRequests.techniqueId))
    .where(and(...conditions))
    .orderBy(desc(implementationRequests.createdAt));

  return rows as ImplementationRequest[];
}

export async function updateRequestStatus(
  requestId: string,
  agentFingerprint: string,
  status: ImplementationRequestStatus
): Promise<ImplementationRequest> {
  const rows = await db
    .update(implementationRequests)
    .set({ status, updatedAt: new Date() })
    .where(
      and(
        eq(implementationRequests.id, requestId),
        eq(implementationRequests.agentFingerprint, agentFingerprint)
      )
    )
    .returning();

  if (rows.length === 0) {
    throw new AppError('REQUEST_NOT_FOUND', 'Implementation request not found', 404);
  }

  return rows[0];
}
