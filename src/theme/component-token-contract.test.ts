// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.join(__dirname, "..", "..");
const scannedRoots = ["src/app", "src/components", "src/navigation"] as const;
const sourceFilePattern = /\.(?:ts|tsx)$/u;
const ignoredFilePattern = /\.(?:test|spec)\.(?:ts|tsx)$/u;

const tokenContractRules = [
  {
    name: "raw color literal",
    pattern:
      /(?:#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|oklch|oklab|color-mix)\()/u,
  },
  {
    name: "arbitrary font-size literal",
    pattern: /\btext-\[[^\]]*(?:px|rem|em|%)\]/u,
  },
  {
    name: "arbitrary radius literal",
    pattern: /\brounded-\[[^\]]+\]/u,
  },
  {
    name: "literal motion duration",
    pattern: /\b(?:duration|delay)-(?:\d|\[[^\]]+\])/u,
  },
  {
    name: "inline transition literal",
    pattern: /\btransition(?:Duration|Delay)?\s*:/u,
  },
] as const;

describe("component token contract", () => {
  it("keeps components, app views, and navigation on semantic tokens", () => {
    const violations = findTokenContractViolations();

    expect(violations).toEqual([]);
  });
});

function findTokenContractViolations(): string[] {
  return scannedRoots
    .flatMap((root) => findSourceFiles(path.join(repoRoot, root)))
    .flatMap((filePath) => violationsForFile(filePath));
}

function findSourceFiles(root: string): string[] {
  const entries = readdirSync(root);
  const files: string[] = [];

  for (const entry of entries) {
    const filePath = path.join(root, entry);
    const stats = statSync(filePath);

    if (stats.isDirectory()) {
      files.push(...findSourceFiles(filePath));
      continue;
    }

    if (
      sourceFilePattern.test(filePath) &&
      !ignoredFilePattern.test(filePath)
    ) {
      files.push(filePath);
    }
  }

  return files.sort();
}

function violationsForFile(filePath: string): string[] {
  const relativePath = path.relative(repoRoot, filePath);
  const lines = readFileSync(filePath, "utf8").split(/\r?\n/u);
  const violations: string[] = [];

  lines.forEach((line, index) => {
    for (const rule of tokenContractRules) {
      if (rule.pattern.test(line)) {
        violations.push(
          `${relativePath}:${index + 1} contains ${rule.name}: ${line.trim()}`,
        );
      }
    }
  });

  return violations;
}
