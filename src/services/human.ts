import bcrypt from 'bcryptjs';
import { pool } from '../db/pool.js';
import { AppError } from '../middleware/error.js';
import type { HumanAccount, HumanAgentLink } from '../types.js';

const SALT_ROUNDS = 12;

export async function createAccount(
  email: string,
  password: string,
  displayName: string | null
): Promise<HumanAccount> {
  const existing = await pool.query('SELECT id FROM human_accounts WHERE email = $1', [email]);
  if (existing.rows.length > 0) {
    throw new AppError('EMAIL_TAKEN', 'An account with that email already exists', 409);
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const { rows } = await pool.query<HumanAccount>(
    `INSERT INTO human_accounts (email, password_hash, display_name)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [email, passwordHash, displayName]
  );
  return rows[0];
}

export async function authenticate(
  email: string,
  password: string
): Promise<HumanAccount> {
  const { rows } = await pool.query<HumanAccount>(
    'SELECT * FROM human_accounts WHERE email = $1',
    [email]
  );
  if (rows.length === 0) {
    throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
  }

  const account = rows[0];
  const valid = await bcrypt.compare(password, account.password_hash);
  if (!valid) {
    throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
  }

  return account;
}

export async function getAccountById(id: string): Promise<HumanAccount | null> {
  const { rows } = await pool.query<HumanAccount>(
    'SELECT * FROM human_accounts WHERE id = $1',
    [id]
  );
  return rows[0] || null;
}

export async function linkAgent(humanId: string, agentFingerprint: string): Promise<void> {
  const agent = await pool.query(
    'SELECT key_fingerprint FROM agent_identities WHERE key_fingerprint = $1',
    [agentFingerprint]
  );
  if (agent.rows.length === 0) {
    throw new AppError('AGENT_NOT_FOUND', 'No agent found with that fingerprint', 404);
  }

  await pool.query(
    `INSERT INTO human_agent_links (human_id, agent_fingerprint)
     VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [humanId, agentFingerprint]
  );
}

export async function unlinkAgent(humanId: string, agentFingerprint: string): Promise<void> {
  const { rowCount } = await pool.query(
    'DELETE FROM human_agent_links WHERE human_id = $1 AND agent_fingerprint = $2',
    [humanId, agentFingerprint]
  );
  if (rowCount === 0) {
    throw new AppError('LINK_NOT_FOUND', 'That agent is not linked to your account', 404);
  }
}

export async function getLinkedAgents(humanId: string): Promise<HumanAgentLink[]> {
  const { rows } = await pool.query<HumanAgentLink>(
    'SELECT * FROM human_agent_links WHERE human_id = $1 ORDER BY linked_at DESC',
    [humanId]
  );
  return rows;
}
