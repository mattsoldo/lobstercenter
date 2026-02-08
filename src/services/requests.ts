import { pool } from '../db/pool.js';
import { AppError } from '../middleware/error.js';
import type { ImplementationRequest, ImplementationRequestStatus } from '../types.js';

export async function createRequest(
  humanId: string,
  techniqueId: string,
  agentFingerprint: string,
  note: string | null
): Promise<ImplementationRequest> {
  // Verify the agent is linked to this human
  const link = await pool.query(
    'SELECT 1 FROM human_agent_links WHERE human_id = $1 AND agent_fingerprint = $2',
    [humanId, agentFingerprint]
  );
  if (link.rows.length === 0) {
    throw new AppError('AGENT_NOT_LINKED', 'That agent is not linked to your account', 403);
  }

  // Verify technique exists
  const technique = await pool.query('SELECT id FROM techniques WHERE id = $1', [techniqueId]);
  if (technique.rows.length === 0) {
    throw new AppError('TECHNIQUE_NOT_FOUND', 'Technique not found', 404);
  }

  const { rows } = await pool.query<ImplementationRequest>(
    `INSERT INTO implementation_requests (human_id, agent_fingerprint, technique_id, note)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [humanId, agentFingerprint, techniqueId, note]
  );
  return rows[0];
}

export async function getRequestsByHuman(humanId: string): Promise<ImplementationRequest[]> {
  const { rows } = await pool.query<ImplementationRequest>(
    `SELECT ir.*, t.title AS technique_title, t.target_surface
     FROM implementation_requests ir
     JOIN techniques t ON t.id = ir.technique_id
     ORDER BY ir.created_at DESC`,
    []
  );
  // Filter in query
  const { rows: filtered } = await pool.query(
    `SELECT ir.*, t.title AS technique_title, t.target_surface
     FROM implementation_requests ir
     JOIN techniques t ON t.id = ir.technique_id
     WHERE ir.human_id = $1
     ORDER BY ir.created_at DESC`,
    [humanId]
  );
  return filtered as ImplementationRequest[];
}

export async function getRequestsForAgent(
  agentFingerprint: string,
  status?: ImplementationRequestStatus
): Promise<ImplementationRequest[]> {
  let query = `
    SELECT ir.*, t.title AS technique_title, t.target_surface
    FROM implementation_requests ir
    JOIN techniques t ON t.id = ir.technique_id
    WHERE ir.agent_fingerprint = $1
  `;
  const params: (string | ImplementationRequestStatus)[] = [agentFingerprint];

  if (status) {
    query += ' AND ir.status = $2';
    params.push(status);
  }

  query += ' ORDER BY ir.created_at DESC';

  const { rows } = await pool.query(query, params);
  return rows as ImplementationRequest[];
}

export async function updateRequestStatus(
  requestId: string,
  agentFingerprint: string,
  status: ImplementationRequestStatus
): Promise<ImplementationRequest> {
  const { rows } = await pool.query<ImplementationRequest>(
    `UPDATE implementation_requests
     SET status = $1, updated_at = NOW()
     WHERE id = $2 AND agent_fingerprint = $3
     RETURNING *`,
    [status, requestId, agentFingerprint]
  );
  if (rows.length === 0) {
    throw new AppError('REQUEST_NOT_FOUND', 'Implementation request not found', 404);
  }
  return rows[0];
}
