import { describe, expect, it } from "vitest";
import { leagueRole } from "@/db/schema";
import type { LeagueRole } from "./guards";
import { roles } from "./permissions";

/**
 * The codebase carries three descriptions of league authority:
 *
 *   1. The `league_role` pg enum in `@/db/schema` — what a row may hold.
 *   2. `ROLE_RANK` in `./guards.ts` — a linear ladder every route guard
 *      resolves through. This is the ENFORCED model.
 *   3. `roles` in `./permissions.ts` — the Better Auth access-control
 *      statements. Nothing server-side calls `hasPermission`, so this model is
 *      currently DECLARATIVE.
 *
 * (2) and (3) disagreed: `league_admin` outranked `data_steward` in the ladder
 * while being denied `leagueData:manage` in the ACL. The ladder silently won, so
 * an admin already passed every steward gate and the ACL misled anyone reading
 * it. T-008 aligned the ACL to the ladder per the owner's ruling
 * (PROJECT_CONTEXT.md §7.1): an admin may do anything an assigned role can do,
 * while an assigned role cannot do everything an admin can.
 *
 * That left `league_admin` and `commissioner` as two names for one authority
 * level — the drift hazard itself. T-008a collapsed them (migration 0082), so
 * the vocabulary now has exactly three rungs.
 *
 * These tests pin all three models together so they cannot drift apart again —
 * whichever one a future change edits, the others must follow.
 */

// Mirrors ROLE_RANK in ./guards.ts, lowest authority first. Kept as a literal
// rather than imported because ROLE_RANK is module-private; the ordering
// assertion below is what keeps the duplicate honest.
const RANK_ASCENDING: readonly LeagueRole[] = [
  "member",
  "data_steward",
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
  it("keeps the pg enum, the rank ladder, and the ACL on one vocabulary", () => {
    // The collapse is only durable if all three lists stay identical. If a
    // future change adds `league_admin` (or anything else) back to one of them
    // and not the others, this fails before the disagreement can reach a guard.
    const enumValues = [...leagueRole.enumValues].sort();

    expect(enumValues).toEqual(["commissioner", "data_steward", "member"]);
    expect(Object.keys(roles).sort()).toEqual(enumValues);
    expect([...RANK_ASCENDING].sort()).toEqual(enumValues);
  });

  it("grants the commissioner every leagueData capability a data_steward has", () => {
    // The divergence this suite exists for: the top of the ladder must not be
    // denied a capability an assigned role holds.
    const steward = new Set(leagueDataCapabilities("data_steward"));
    const commissioner = new Set(leagueDataCapabilities("commissioner"));

    expect([...steward].sort()).toEqual(["manage", "review"]);
    for (const capability of steward) {
      expect(commissioner).toContain(capability);
    }
  });

  it("keeps leagueData capabilities monotonic along the rank ladder", () => {
    // Generalises the rule: every step up the ladder is a superset of the step
    // below it. Catches any future role edit that reintroduces a disagreement,
    // not just the commissioner/data_steward case.
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
