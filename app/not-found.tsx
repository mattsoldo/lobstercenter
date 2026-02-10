import Link from 'next/link';

export const metadata = { title: 'Not Found' };

export default function NotFound() {
  return (
    <div className="empty-state">
      <h1>Not Found</h1>
      <p>The page you&apos;re looking for doesn&apos;t exist.</p>
      <Link href="/" className="btn">Go Home</Link>
    </div>
  );
}
