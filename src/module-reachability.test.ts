// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Fails when a domain module has no non-test importer.
 *
 * This exists because of a repeated, expensive failure in this codebase: a
 * module gets written, tested, falsified, marked done — and never wired into a
 * production path. It passes review and every gate, and it does nothing.
 *
 * Observed instances before this test existed:
 *   - `betting/pickem-grading` had no caller, so `picks.status` never left
 *     `pending` and every league's accuracy would have read 0% forever.
 *   - `betting/event-results` had no importer, so `game.final` kept shipping a
 *     fantasy-matchup id with no `bettingEventId` — UIX-101, still live months
 *     after being "fixed".
 *   - `betting/pickem-standings` computed league accuracy that nothing read.
 *
 * A green unit test proves a module is correct. It cannot prove the module is
 * reached. That is what this checks, and it is deliberately a test rather than
 * a lint rule so it runs in the same gate as everything else.
 */

const SOURCE_ROOT = "src";

/**
 * Modules that legitimately have no non-test importer, each with the reason.
 * Adding an entry is a decision, not an oversight — which is the point.
 */
const ALLOWED_WITHOUT_IMPORTER = new Map<string, string>([
  ["ai/personal-agent.type-test", "type-level assertions; no runtime export"],
  ["db/test-support", "test harness: serialized migrate for vitest workers"],
  ["testing/arbitraries", "property-test generators"],
  ["testing/canon", "shared test fixtures"],
  ["testing/vcr", "provider payload record/replay for tests"],
  ["testing/vitest-setup", "referenced by vitest.config.ts, not by imports"],
  // NOT a justification — a dated carve-out. This is a 264-line loader for an
  // import-summary view that was never built, and it predates the reachability
  // gate. Deleting an unshipped feature is the maintainer's call, so it is
  // parked here VISIBLY rather than quietly passing. Decide by shipping a page
  // that reads it or deleting it; do not let this list grow.
  [
    "ingestion/import-summary",
    "unconsumed since before this gate existed (2026-07-30) — decision pending",
  ],
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (/\.tsx?$/.test(full)) {
      out.push(full);
    }
  }
  return out;
}

function isTestFile(file: string): boolean {
  return /\.test\.tsx?$/.test(file);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

describe("module reachability", () => {
  it("has a non-test importer for every domain module", () => {
    const files = walk(SOURCE_ROOT);
    const bodies = files.map((file) => ({
      body: readFileSync(file, "utf8"),
      file,
    }));

    const orphans: string[] = [];
    for (const file of files) {
      if (isTestFile(file)) continue;

      const moduleId = file.replace(/^src\//, "").replace(/\.tsx?$/, "");
      const base = path.basename(moduleId);

      // `src/app/**` is the App Router: pages, layouts and route handlers are
      // entrypoints Next.js reaches by convention, not by import. A barrel's
      // whole job is to be imported from elsewhere by its directory name.
      if (moduleId.startsWith("app/") || base === "index") continue;
      if (ALLOWED_WITHOUT_IMPORTER.has(moduleId)) continue;

      // Both static and DYNAMIC imports count. `next/dynamic` uses `import()`,
      // so matching only `from "..."` reports every lazily-loaded panel as
      // orphaned — which is how the first draft of this check produced four
      // false positives.
      const aliasPath = escapeRegExp(moduleId);
      const relBase = escapeRegExp(base);
      const patterns = [
        new RegExp(`from\\s+["']@/${aliasPath}["']`),
        new RegExp(`import\\(\\s*["']@/${aliasPath}["']`),
        new RegExp(`from\\s+["']\\.{1,2}/[^"']*${relBase}["']`),
        new RegExp(`import\\(\\s*["']\\.{1,2}/[^"']*${relBase}["']`),
      ];

      const reached = bodies.some(
        (candidate) =>
          candidate.file !== file &&
          !isTestFile(candidate.file) &&
          patterns.some((pattern) => pattern.test(candidate.body)),
      );
      if (!reached) {
        orphans.push(moduleId);
      }
    }

    expect(orphans).toEqual([]);
  });

  it("keeps the allowlist free of modules that no longer exist", () => {
    const present = new Set(
      walk(SOURCE_ROOT)
        .filter((file) => !isTestFile(file))
        .map((file) => file.replace(/^src\//, "").replace(/\.tsx?$/, "")),
    );
    const stale = [...ALLOWED_WITHOUT_IMPORTER.keys()].filter(
      (moduleId) => !present.has(moduleId),
    );
    expect(stale).toEqual([]);
  });
});
