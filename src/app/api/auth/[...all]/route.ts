import { toNextJsHandler } from "better-auth/next-js";
import { NextResponse } from "next/server";
import { getAuth } from "@/auth";
import { recordApiHandler } from "@/core/metrics";

// Resolve the auth instance per request, not at module scope: `next build`
// runs with NODE_ENV=production and would otherwise trip env validation
// (BETTER_AUTH_SECRET required in production) while collecting page data.
const authHandlers = toNextJsHandler((request) => getAuth().handler(request));

/**
 * Better Auth organization endpoints that mutate league membership, fenced off
 * from this catch-all mount.
 *
 * Leagues are modelled as Better Auth organizations, so enabling the
 * organization plugin also HTTP-exposes its member CRUD. Those routes authorize
 * purely against the plugin's own access-control statements and therefore
 * bypass every domain rule the app enforces:
 *
 *   - `requireLeagueRole` never runs, so the commissioner-only guard on role
 *     assignment (`src/onboarding/stewards.ts`) does not apply;
 *   - no audit row is written, unlike every domain mutation;
 *   - removing a member skips cleanup of that member's identity claims and push
 *     subscriptions, orphaning league-scoped rows.
 *
 * Membership changes must go through the domain routes under
 * `/api/leagues/[leagueId]/…`, which enforce all three.
 *
 * Self-promotion to commissioner was already blocked upstream — Better Auth
 * refuses to let a non-creator set or modify the `creatorRole` — so this closes
 * the remaining gap rather than the whole surface. Sign-in, sessions,
 * invitations and the rest of the Better Auth surface are untouched.
 */
const FENCED_ORGANIZATION_PATHS = new Set([
  "/organization/update-member-role",
  "/organization/remove-member",
]);

function fencedResponse(): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: "LEAGUE_MEMBERSHIP_ROUTE_DISABLED",
        message:
          "League membership is managed through the league's own endpoints, not the auth plane.",
        status: 404,
      },
    },
    { status: 404 },
  );
}

function isFenced(request: Request): boolean {
  const { pathname } = new URL(request.url);
  // Match on the trailing segments so the check is independent of the mount
  // prefix, and tolerate a trailing slash.
  const normalized = pathname.replace(/\/+$/, "");
  for (const fenced of FENCED_ORGANIZATION_PATHS) {
    if (normalized.endsWith(fenced)) {
      return true;
    }
  }
  return false;
}

export const GET = recordApiHandler(
  { method: "GET", route: "/api/auth/[...all]" },
  async (request: Request) =>
    isFenced(request) ? fencedResponse() : authHandlers.GET(request),
);
export const POST = recordApiHandler(
  { method: "POST", route: "/api/auth/[...all]" },
  async (request: Request) =>
    isFenced(request) ? fencedResponse() : authHandlers.POST(request),
);
