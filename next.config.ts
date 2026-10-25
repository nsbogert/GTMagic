import type { NextConfig } from "next";

// Local-only app: it reads gtm-workspace/ and fixtures/ from disk next to the repo.
const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
