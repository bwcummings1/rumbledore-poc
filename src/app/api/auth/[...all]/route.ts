import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/auth";

// Resolve the auth instance per request, not at module scope: `next build`
// runs with NODE_ENV=production and would otherwise trip env validation
// (BETTER_AUTH_SECRET required in production) while collecting page data.
export const { GET, POST } = toNextJsHandler((request) =>
  getAuth().handler(request),
);
