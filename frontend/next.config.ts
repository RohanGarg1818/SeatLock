import type { NextConfig } from 'next';

// The API lives on another origin in production (Render). Every browser call goes to /api/* on THIS site and
// Next.js proxies it to the API. To the browser, the auth cookie then belongs to the website itself
// (a first-party cookie), so Safari/Chrome third-party-cookie blocking cannot break login.
const API_URL = process.env.API_URL || 'http://localhost:4000';

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_URL}/:path*` }];
  },
  poweredByHeader: false,
};

export default nextConfig;
