import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces a minimal traced Node server for the VPS container. Vercel keeps
  // using the same application build configuration.
  output: 'standalone',
  deploymentId: process.env.DEPLOYMENT_VERSION,
};

export default nextConfig;
