// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A per-route rate limit is only as good as the next route nobody remembers to
 * add one to. This walks the App Router API tree instead of trusting a list, so
 * a new mutating handler fails here until somebody decides — in writing —
 * whether it needs a limiter.
 */

const apiRoot = path.join(__dirname);
const MUTATING_EXPORT = /export const (POST|PUT|PATCH|DELETE)\b/u;
const RATE_LIMIT_CALL = /enforceApiRateLimit(OrReject)?\(/u;

/** Routes that must consult the limiter before doing their expensive work. */
const RATE_LIMITED = new Set([
  // Paid provider: Anthropic generation.
  "leagues/[leagueId]/cast/personas/[persona]/tone/preview/route.ts",
  "leagues/[leagueId]/press/[postId]/regenerate/route.ts",
  "leagues/[leagueId]/press/failures/[runId]/retry/route.ts",
  "personal-agent/messages/route.ts",
  // Paid provider: Browserbase sessions and third-party fantasy provider fetches.
  "onboarding/espn/browser/capture/route.ts",
  "onboarding/espn/browser/start/route.ts",
  "onboarding/espn/import/route.ts",
  "onboarding/espn/manual/route.ts",
  "onboarding/import/route.ts",
  "onboarding/sleeper/connect/route.ts",
  "onboarding/sleeper/import/route.ts",
  "onboarding/yahoo/import/route.ts",
  "onboarding/yahoo/start/route.ts",
  // Member-facing writes that a script could otherwise churn.
  "invite/[leagueId]/[token]/accept/route.ts",
  "leagues/[leagueId]/lore/claims/[claimId]/votes/route.ts",
  "leagues/[leagueId]/lore/claims/route.ts",
  "leagues/[leagueId]/polls/[pollId]/votes/route.ts",
  "leagues/[leagueId]/picks/route.ts",
  "leagues/[leagueId]/press/[postId]/reactions/route.ts",
]);

/**
 * Routes deliberately left unlimited, each with the reason. Adding a route here
 * is a decision, not an oversight — which is the entire point of the list.
 */
const EXEMPT = new Map([
  ["auth/[...all]/route.ts", "better-auth owns its own throttling"],
  ["inngest/route.ts", "signed job webhook, not reachable by a browser client"],
  ["admin/entitlements/route.ts", "platform-administrator only"],
  ["leagues/[leagueId]/bet/slips/route.ts", "bounded by the paper bankroll"],
  [
    "leagues/[leagueId]/cast/personas/[persona]/tone/rollback/route.ts",
    "platform-administrator only; no provider call",
  ],
  [
    "leagues/[leagueId]/cast/personas/[persona]/tone/route.ts",
    "platform-administrator only; no provider call",
  ],
  ["leagues/[leagueId]/commissioner/handoff/route.ts", "commissioner only"],
  [
    "leagues/[leagueId]/curation/checkpoints/[checkpointId]/restore/route.ts",
    "data steward only",
  ],
  ["leagues/[leagueId]/curation/checkpoints/route.ts", "data steward only"],
  ["leagues/[leagueId]/curation/edits/route.ts", "data steward only"],
  ["leagues/[leagueId]/curation/groupings/route.ts", "data steward only"],
  ["leagues/[leagueId]/curation/push/route.ts", "data steward only"],
  [
    "leagues/[leagueId]/curation/seasons/[season]/mode/route.ts",
    "data steward only",
  ],
  ["leagues/[leagueId]/invites/route.ts", "commissioner-gated invite issuance"],
  ["leagues/[leagueId]/lore/claims/[claimId]/steward/route.ts", "steward only"],
  ["leagues/[leagueId]/press/[postId]/retract/route.ts", "steward only"],
  ["leagues/[leagueId]/roast-consent/route.ts", "one row per member"],
  ["leagues/[leagueId]/steward/integrity/route.ts", "steward only"],
  ["leagues/[leagueId]/stewards/route.ts", "commissioner only"],
  ["leagues/[leagueId]/webhooks/[webhookId]/route.ts", "commissioner only"],
  ["leagues/[leagueId]/webhooks/route.ts", "commissioner only"],
  ["onboarding/quarantine/review/route.ts", "data steward only"],
  ["push/preferences/route.ts", "one preference row per member"],
  ["push/subscriptions/account/route.ts", "one row per browser subscription"],
  ["push/subscriptions/route.ts", "one row per browser subscription"],
  ["push/subscriptions/status/route.ts", "read-through status probe"],
]);

function mutatingRouteFiles(dir: string, prefix = ""): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      found.push(...mutatingRouteFiles(path.join(dir, entry.name), relative));
      continue;
    }
    if (entry.name !== "route.ts") {
      continue;
    }
    if (
      MUTATING_EXPORT.test(readFileSync(path.join(dir, entry.name), "utf8"))
    ) {
      found.push(relative);
    }
  }
  return found.sort();
}

const mutatingRoutes = mutatingRouteFiles(apiRoot);

describe("API rate limit coverage", () => {
  it("finds the mutating route handlers to classify", () => {
    expect(mutatingRoutes.length).toBeGreaterThan(20);
  });

  it("classifies every mutating route as limited or explicitly exempt", () => {
    const unclassified = mutatingRoutes.filter(
      (route) => !RATE_LIMITED.has(route) && !EXEMPT.has(route),
    );

    expect(unclassified).toEqual([]);
  });

  it("keeps the classification lists free of routes that no longer exist", () => {
    const known = new Set(mutatingRoutes);
    const stale = [...RATE_LIMITED, ...EXEMPT.keys()].filter(
      (route) => !known.has(route),
    );

    expect(stale).toEqual([]);
  });

  it("enforces a limit on every route classified as rate limited", () => {
    const missing = [...RATE_LIMITED].filter(
      (route) =>
        !RATE_LIMIT_CALL.test(readFileSync(path.join(apiRoot, route), "utf8")),
    );

    expect(missing).toEqual([]);
  });
});
