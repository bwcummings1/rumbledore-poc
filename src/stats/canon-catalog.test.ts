import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const ALLOWED_BRAND_ASSERTION_FILES = new Set([
  "src/stats/canon-catalog.ts",
  "src/testing/canon.ts",
]);

function sourceFiles(root: string): string[] {
  const entries = readdirSync(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const absolutePath = join(root, entry.name);
    if (entry.isDirectory()) {
      if ([".next", ".git", "node_modules"].includes(entry.name)) {
        continue;
      }
      files.push(...sourceFiles(absolutePath));
      continue;
    }
    if (entry.isFile() && /\.(ts|tsx)$/u.test(entry.name)) {
      files.push(absolutePath);
    }
  }
  return files;
}

describe("CanonCatalog provenance", () => {
  it("keeps brand assertions inside the canonical producer and test forge", () => {
    const repoRoot = process.cwd();
    const assertionPattern = new RegExp(
      ["as", "\\s+", "CanonCatalog\\b"].join(""),
    );
    const violations = [join(repoRoot, "src"), join(repoRoot, "test")]
      .flatMap(sourceFiles)
      .map((absolutePath) => ({
        absolutePath,
        source: readFileSync(absolutePath, "utf8"),
      }))
      .filter(({ absolutePath, source }) => {
        const relativePath = relative(repoRoot, absolutePath)
          .split(sep)
          .join("/");
        return (
          assertionPattern.test(source) &&
          !ALLOWED_BRAND_ASSERTION_FILES.has(relativePath)
        );
      })
      .map(({ absolutePath }) =>
        relative(repoRoot, absolutePath).split(sep).join("/"),
      );

    expect(violations).toEqual([]);
  });
});
