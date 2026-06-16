// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.join(__dirname, "..", "..");

describe("AUSPEX accessibility foundation", () => {
  it("defines a token-driven global focus-visible ring", () => {
    const globalsCss = readGlobalsCss();
    const focusBlock = extractBlock(globalsCss, "):focus-visible {");

    expect(focusBlock).toContain(
      "outline: var(--focus-ring-width, 2px) solid var(--ring);",
    );
    expect(focusBlock).toContain(
      "outline-offset: var(--focus-ring-offset, 2px);",
    );
    expect(focusBlock).toContain(
      "box-shadow: var(--focus-ring-shadow, 0 0 0 4px var(--ring));",
    );
    expect(focusBlock).toContain("var(--motion-duration-focus-bloom)");
    expect(focusBlock).toContain("var(--motion-ease-spring)");
  });

  it("collapses focus-bloom motion under reduced motion while preserving the ring", () => {
    const reducedMotionBlock = extractBlock(
      readGlobalsCss(),
      "@media (prefers-reduced-motion: reduce)",
    );

    expect(reducedMotionBlock).toContain("):focus-visible {");
    expect(reducedMotionBlock).toContain(
      "animation-duration: var(--motion-duration-fast);",
    );
    expect(reducedMotionBlock).toContain(
      "transition-duration: var(--motion-duration-fast);",
    );
    expect(reducedMotionBlock).toContain(
      "transition-duration: var(--motion-duration-focus-bloom);",
    );
    expect(reducedMotionBlock).toContain(".orb::before");
    expect(reducedMotionBlock).toContain(".auspex-atmosphere__starfield");
  });
});

function readGlobalsCss(): string {
  return readFileSync(path.join(repoRoot, "src/app/globals.css"), "utf8");
}

function extractBlock(source: string, marker: string): string {
  const start = source.indexOf(marker);
  if (start < 0) {
    return "";
  }

  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") {
      depth += 1;
      continue;
    }
    if (char !== "}") {
      continue;
    }
    depth -= 1;
    if (depth === 0) {
      return source.slice(start, index + 1);
    }
  }

  return source.slice(start);
}
