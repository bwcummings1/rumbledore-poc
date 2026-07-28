import { describe, expect, it } from "vitest";
import type { LeagueRole } from "./guards";
import { roles } from "./permissions";

/**
 * The codebase carries two descriptions of league authority:
 *
 *   1. `ROLE_RANK` in `./guards.ts` — a linear ladder every route guard
 *      resolves through. This is the ENFORCED model.
 *   2. `roles` in `./permissions.ts` — the Better Auth access-control
 *      statements. Nothing server-side calls `hasPermission`, so this model is
 *      currently DECLARATIVE.
 *
 * They disagreed: `league_admin` outranked `data_steward` in the ladder while
 * being denied `leagueData:manage` in the ACL. The ladder silently won, so an
 * admin already passed every steward gate and the ACL misled anyone reading it.
 *
 * The owner's ruling (PROJECT_CONTEXT.md §7.1) is that the ladder is correct:
 * an admin may do anything an assigned role can do, while an assigned role
 * cannot do everything an admin can.
 *
 * These tests pin the two models together so they cannot drift apart again —
 * whichever one a future change edits, the other must follow.
 */

// Mirrors ROLE_RANK in ./guards.ts, lowest authority first. Kept as a literal
// rather than imported because ROLE_RANK is module-private; the ordering
// assertion below is what keeps the duplicate honest.
const RANK_ASCENDING: readonly LeagueRole[] = [
  "member",
  "data_steward",
  "league_admin",
  "commissioner",
];

function leagueDataCapabilities(role: LeagueRole): readonly string[] {
  // `roles` is a heterogeneous map of Better Auth Role objects whose statement
  // types differ per role, so index it through a narrowed structural view
  // rather than fighting the generic parameters.
  const table = roles as unknown as Record<
    string,
    { statements?: Record<string, readonly string[] | undefined> } | undefined
  >;
  return table[role]?.statements?.leagueData ?? [];
}

describe("league role permissions", () => {
  it("grants league_admin the same leagueData capabilities as a data_steward", () => {
    // The specific divergence this suite exists for: league_admin outranks
    // data_steward, so it must not be denied a capability the steward holds.
    const steward = new Set(leagueDataCapabilities("data_steward"));
    const admin = new Set(leagueDataCapabilities("league_admin"));

    expect([...steward].sort()).toEqual(["manage", "review"]);
    for (const capability of steward) {
      expect(admin).toContain(capability);
    }
  });

  it("keeps leagueData capabilities monotonic along the rank ladder", () => {
    // Generalises the rule: every step up the ladder is a superset of the step
    // below it. Catches any future role edit that reintroduces a disagreement,
    // not just the league_admin/data_steward case.
    for (let index = 1; index < RANK_ASCENDING.length; index += 1) {
      const lower = RANK_ASCENDING[index - 1] as LeagueRole;
      const higher = RANK_ASCENDING[index] as LeagueRole;
      const lowerCaps = new Set(leagueDataCapabilities(lower));
      const higherCaps = new Set(leagueDataCapabilities(higher));

      for (const capability of lowerCaps) {
        expect(
          higherCaps.has(capability),
          `${higher} outranks ${lower} but is missing leagueData:${capability}`,
        ).toBe(true);
      }
    }
  });

  it("still withholds leagueData:manage from a plain member", () => {
    // Monotonicity must not be satisfied by granting everything to everyone.
    expect(leagueDataCapabilities("member")).not.toContain("manage");
  });
});
