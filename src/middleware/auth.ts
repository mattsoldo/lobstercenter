import { Request, Response, NextFunction } from 'express';
import { getAuth } from '@clerk/express';
import { eq } from 'drizzle-orm';
import { db } from '../db/pool.js';
import { humanAccounts } from '../db/schema.js';

// Derive Clerk Account Portal domain from the publishable key.
// The key encodes the Frontend API domain (e.g. "slug.clerk.accounts.dev").
// The Account Portal lives at the same domain minus ".clerk" (e.g. "slug.accounts.dev").
function getAccountPortalDomain(): string {
  const pk = process.env.CLERK_PUBLISHABLE_KEY || '';
  const match = pk.match(/^pk_(?:test|live)_(.+?)$/);
  if (match) {
    try {
      const frontendApi = Buffer.from(match[1], 'base64').toString('utf8').replace(/\$$/, '');
      return frontendApi.replace('.clerk.', '.');
    } catch { /* fall through */ }
  }
  return 'accounts.dev';
}

const clerkDomain = getAccountPortalDomain();
export const clerkSignInUrl = `https://${clerkDomain}/sign-in`;
export const clerkSignUpUrl = `https://${clerkDomain}/sign-up`;

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const { userId } = getAuth(req);
  if (!userId) {
    res.redirect(clerkSignInUrl + '?redirect_url=' + encodeURIComponent(req.originalUrl));
    return;
  }
  next();
}

export async function loadUser(req: Request, res: Response, next: NextFunction) {
  const { userId } = getAuth(req);

  // Make Clerk URLs available to templates
  res.locals.clerkSignInUrl = clerkSignInUrl;
  res.locals.clerkSignUpUrl = clerkSignUpUrl;

  if (!userId) {
    res.locals.user = null;
    return next();
  }

  try {
    const rows = await db
      .select()
      .from(humanAccounts)
      .where(eq(humanAccounts.clerkUserId, userId));

    if (rows.length > 0) {
      res.locals.user = rows[0];
    } else {
      // Auto-provision local account on first visit
      const [account] = await db
        .insert(humanAccounts)
        .values({
          clerkUserId: userId,
          email: 'pending@clerk.dev', // will be synced via webhook or next auth
          displayName: null,
        })
        .returning();
      res.locals.user = account;
    }
  } catch (err) {
    console.error('Failed to load user from Clerk ID:', err);
    res.locals.user = null;
  }

  next();
}
