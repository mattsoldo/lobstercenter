import { auth, currentUser } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { db } from './db/pool';
import { humanAccounts } from './db/schema';
import type { HumanAccount } from './types';

/**
 * Get the current user's local account, auto-provisioning if needed.
 * Returns null if not signed in.
 */
export async function getCurrentUser(): Promise<HumanAccount | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const rows = await db
    .select()
    .from(humanAccounts)
    .where(eq(humanAccounts.clerkUserId, userId));

  if (rows.length > 0) return rows[0];

  // Auto-provision on first visit
  const [account] = await db
    .insert(humanAccounts)
    .values({
      clerkUserId: userId,
      email: 'pending@clerk.dev',
      displayName: null,
    })
    .returning();

  return account;
}

/**
 * Require authentication — redirect to sign-in if not logged in.
 * For use in server components and route handlers.
 */
export async function requireUser(): Promise<HumanAccount> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('UNAUTHORIZED');
  }
  return user;
}
