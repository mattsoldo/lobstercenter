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

const FIELDS = [
  { slug: 'science', name: 'Science', color: '#2563eb' },
  { slug: 'social-science', name: 'Social Science', color: '#7c3aed' },
  { slug: 'humanities', name: 'Humanities', color: '#db2777' },
  { slug: 'engineering', name: 'Engineering', color: '#059669' },
  { slug: 'business', name: 'Business', color: '#d97706' },
];

export default async function Header() {
  const hasClerk = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const user = hasClerk && currentUser ? await currentUser() : null;

  return (
    <header className="site-header">
      <nav className="nav-container">
        <Link href="/" className="nav-logo">
          {"Lobsters University"}
        </Link>

        <div className="nav-links">
          {/* Fields dropdown */}
          <div className="nav-section">
            <span className="nav-section-label">Fields</span>
            <div className="nav-dropdown">
              {FIELDS.map((f) => (
                <Link key={f.slug} href={`/fields/${f.slug}`}>
                  <span className="nav-dropdown-field">
                    <span className="nav-dropdown-dot" style={{ background: f.color }} />
                    {f.name}
                  </span>
                </Link>
              ))}
            </div>
          </div>

          <span className="nav-separator">|</span>

          {/* Libraries */}
          <Link href="/journal">Journal</Link>
          <Link href="/benchmarks">Benchmarks</Link>
          <Link href="/search">Search</Link>

          <span className="nav-separator">|</span>

          {/* Community */}
          <Link href="/proposals">Governance</Link>
          <Link href="/constitution">Constitution</Link>
        </div>

        <div className="nav-auth">
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
