import path from "node:path";
import type { NextConfig } from "next";
import { LEAGUE_PAGE_CACHE_HEADER_RULE } from "./src/app/league-cache-headers";
import {
  MOCK_BROWSER_SECURITY_HEADER_RULE,
  SECURITY_HEADER_RULE,
} from "./src/app/security-headers";

const nextConfig: NextConfig = {
  async headers() {
    return [
      SECURITY_HEADER_RULE,
      MOCK_BROWSER_SECURITY_HEADER_RULE,
      LEAGUE_PAGE_CACHE_HEADER_RULE,
    ];
  },
  // Stray lockfiles in $HOME make Next infer the wrong workspace root.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
