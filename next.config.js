/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: require('path').join(__dirname),
  eslint: {
    // Disable ESLint during production builds
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Optionally also ignore TypeScript errors during builds
    // ignoreBuildErrors: true,
  },
};

module.exports = nextConfig;
