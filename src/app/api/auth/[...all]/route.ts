import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/auth";
import { recordApiHandler } from "@/core/metrics";

// Resolve the auth instance per request, not at module scope: `next build`
// runs with NODE_ENV=production and would otherwise trip env validation
// (BETTER_AUTH_SECRET required in production) while collecting page data.
const authHandlers = toNextJsHandler((request) => getAuth().handler(request));

export const GET = recordApiHandler(
  { method: "GET", route: "/api/auth/[...all]" },
  authHandlers.GET,
);
export const POST = recordApiHandler(
  { method: "POST", route: "/api/auth/[...all]" },
  authHandlers.POST,
);
