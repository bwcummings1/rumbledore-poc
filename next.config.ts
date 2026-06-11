import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Stray lockfiles in $HOME make Next infer the wrong workspace root.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
