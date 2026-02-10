import { eq, and, lte, sql } from 'drizzle-orm';
import { db } from '../db/pool';
import { pool } from '../db/pool';
import { jobQueue } from '../db/schema';

type JobHandler = (payload: Record<string, unknown>) => Promise<void>;

/**
 * PostgreSQL-backed job queue using SELECT FOR UPDATE SKIP LOCKED.
 * No external queue infrastructure needed.
 */
export async function enqueue(
  jobType: string,
  payload: Record<string, unknown>,
  options?: { scheduledFor?: Date; maxAttempts?: number }
): Promise<string> {
  const rows = await db
    .insert(jobQueue)
    .values({
      jobType,
      payload,
      scheduledFor: options?.scheduledFor ?? new Date(),
      maxAttempts: options?.maxAttempts ?? 3,
    })
    .returning({ id: jobQueue.id });

  return rows[0].id;
}

/**
 * Dequeue and process one job of the given type.
 * Uses SKIP LOCKED so multiple workers can process concurrently without conflicts.
 */
export async function dequeueOne(jobType: string, handler: JobHandler): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // SELECT FOR UPDATE SKIP LOCKED — the PostgreSQL queue pattern
    const { rows } = await client.query(
      `UPDATE job_queue
       SET status = 'PROCESSING', attempts = attempts + 1, updated_at = NOW()
       WHERE id = (
         SELECT id FROM job_queue
         WHERE job_type = $1
           AND status = 'PENDING'
           AND scheduled_for <= NOW()
           AND attempts < max_attempts
         ORDER BY scheduled_for ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED
       )
       RETURNING *`,
      [jobType]
    );

    if (rows.length === 0) {
      await client.query('COMMIT');
      return false;
    }

    const job = rows[0];

    try {
      await handler(job.payload);
      await client.query(
        `UPDATE job_queue SET status = 'COMPLETED', updated_at = NOW() WHERE id = $1`,
        [job.id]
      );
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const newStatus = job.attempts >= job.max_attempts ? 'FAILED' : 'PENDING';
      await client.query(
        `UPDATE job_queue SET status = $1, last_error = $2, updated_at = NOW() WHERE id = $3`,
        [newStatus, errorMsg, job.id]
      );
    }

    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Process jobs in a loop. Call this to start a worker.
 */
export function startWorker(
  jobType: string,
  handler: JobHandler,
  pollIntervalMs = 5000
): { stop: () => void } {
  let running = true;

  const loop = async () => {
    while (running) {
      try {
        const processed = await dequeueOne(jobType, handler);
        if (!processed) {
          // No jobs available, wait before polling again
          await new Promise((r) => setTimeout(r, pollIntervalMs));
        }
        // If we processed a job, immediately try the next one (no delay)
      } catch (err) {
        console.error(`Worker error [${jobType}]:`, err);
        await new Promise((r) => setTimeout(r, pollIntervalMs));
      }
    }
  };

  loop();
  return { stop: () => { running = false; } };
}
