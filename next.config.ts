import type { NextConfig } from "next";

// Local-only app: it reads gtm-workspace/ and fixtures/ from disk next to the repo.
const nextConfig: NextConfig = {
  reactStrictMode: true,
  // src/proxy.ts makes Next buffer every request body, cutting it off at this size (default 10 MB).
  // Keep it above MAX_ANSWER_BYTES (50 MB, src/app/_session/store.ts) plus multipart overhead.
  experimental: { proxyClientMaxBodySize: "60mb" },
  // Don't set devIndicators: false here: on Next 16.4 it put the dev server into a rebuild/reload
  // loop (a rebuild after every page load). The small dev badge is dev-only.
};

export default nextConfig;
