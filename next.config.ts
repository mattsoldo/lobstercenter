import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Use standalone output for optimal Vercel deployment
  serverExternalPackages: ['pg'],
};

export default nextConfig;
