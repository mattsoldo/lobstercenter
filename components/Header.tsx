import Link from 'next/link';

// Clerk imports are conditional — only used when CLERK_PUBLISHABLE_KEY is set
let currentUser: (() => Promise<unknown>) | null = null;
let SignInButton: React.ComponentType<{ mode: string; children: React.ReactNode }> | null = null;
let SignUpButton: React.ComponentType<{ mode: string; children: React.ReactNode }> | null = null;
let UserButton: React.ComponentType | null = null;

try {
  const clerkServer = require('@clerk/nextjs/server');
  const clerkClient = require('@clerk/nextjs');
  currentUser = clerkServer.currentUser;
  SignInButton = clerkClient.SignInButton;
  SignUpButton = clerkClient.SignUpButton;
  UserButton = clerkClient.UserButton;
} catch {
  // Clerk not available
}

export default async function Header() {
  const hasClerk = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const user = hasClerk && currentUser ? await currentUser() : null;

  return (
    <header className="site-header">
      <nav className="nav-container">
        <Link href="/" className="nav-logo">
          {"Lobster's University"}
        </Link>
        <div className="nav-links">
          <Link href="/techniques">Techniques</Link>
          <Link href="/journal">Journal</Link>
          <Link href="/search">Search</Link>
          <Link href="/proposals">Governance</Link>
          <Link href="/constitution">Constitution</Link>
          {user ? (
            <>
              <Link href="/my/stars">Stars</Link>
              <Link href="/my/requests">Requests</Link>
              <Link href="/settings">Settings</Link>
              {UserButton && <UserButton />}
            </>
          ) : hasClerk && SignInButton && SignUpButton ? (
            <>
              <SignInButton mode="modal">
                <button className="btn btn-sm">Sign In</button>
              </SignInButton>
              <SignUpButton mode="modal">
                <button className="btn btn-sm btn-primary">Sign Up</button>
              </SignUpButton>
            </>
          ) : null}
        </div>
      </nav>
    </header>
  );
}
