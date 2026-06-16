// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createThemeCss,
  getReducedMotionCssVariables,
  REDUCED_MOTION_CSS_VARIABLE_NAMES,
  REDUCED_MOTION_DURATION_ALIAS_TOKENS,
  REDUCED_MOTION_DURATION_MS,
  REDUCED_MOTION_DURATION_TOKENS,
} from "./registry";
import { MOTION_TOKEN_NAMES } from "./types";

const repoRoot = path.join(__dirname, "..", "..");

describe("reduced-motion theme tokens", () => {
  it("covers every motion duration token with a reduced override", () => {
    const durationTokenNames = MOTION_TOKEN_NAMES.filter((name) =>
      name.includes("duration"),
    );

    expect([...REDUCED_MOTION_CSS_VARIABLE_NAMES].sort()).toEqual(
      [...durationTokenNames].sort(),
    );

    const variables = getReducedMotionCssVariables();
    for (const tokenName of REDUCED_MOTION_DURATION_TOKENS) {
      expect(
        parseCssDurationMs(variables[tokenName]),
        tokenName,
      ).toBeLessThanOrEqual(REDUCED_MOTION_DURATION_MS);
    }

    for (const [aliasName, targetName] of Object.entries(
      REDUCED_MOTION_DURATION_ALIAS_TOKENS,
    )) {
      expect(variables[aliasName]).toBe(`var(--${targetName})`);
    }
  });

  it("emits reduced-motion overrides after theme token blocks", () => {
    const css = createThemeCss();
    const mediaIndex = css.indexOf("@media (prefers-reduced-motion: reduce)");
    const motionSwitchIndex = css.indexOf(':root[data-motion="off"]');

    expect(mediaIndex).toBeGreaterThan(
      css.lastIndexOf('[data-theme="palette-b"]'),
    );
    expect(motionSwitchIndex).toBeGreaterThan(
      css.lastIndexOf('[data-theme="palette-b"]'),
    );

    const declarations = extractCssDeclarations(css.slice(mediaIndex));
    const motionSwitchDeclarations = extractCssDeclarations(
      css.slice(motionSwitchIndex, mediaIndex),
    );
    for (const tokenName of REDUCED_MOTION_DURATION_TOKENS) {
      expect(
        parseCssDurationMs(declarations[`--${tokenName}`]),
        tokenName,
      ).toBeLessThanOrEqual(REDUCED_MOTION_DURATION_MS);
      expect(
        parseCssDurationMs(motionSwitchDeclarations[`--${tokenName}`]),
        tokenName,
      ).toBeLessThanOrEqual(REDUCED_MOTION_DURATION_MS);
    }
    for (const [aliasName, targetName] of Object.entries(
      REDUCED_MOTION_DURATION_ALIAS_TOKENS,
    )) {
      expect(declarations[`--${aliasName}`]).toBe(`var(--${targetName})`);
      expect(motionSwitchDeclarations[`--${aliasName}`]).toBe(
        `var(--${targetName})`,
      );
    }
  });

  it("routes Tailwind duration tokens through reduced-motion-aware aliases", () => {
    const globalsCss = readFileSync(
      path.join(repoRoot, "src/app/globals.css"),
      "utf8",
    );

    expect(globalsCss).toContain(
      "--duration-fast: var(--motion-duration-fast);",
    );
    expect(globalsCss).toContain(
      "--duration-base: var(--motion-duration-base);",
    );
    expect(globalsCss).toContain(
      "--duration-slow: var(--motion-duration-slow);",
    );
    expect(globalsCss).toContain("--duration-orb: var(--motion-duration-orb);");
    expect(globalsCss).toContain(
      "--duration-atmosphere: var(--motion-duration-atmosphere);",
    );
    expect(globalsCss).toContain(
      "--duration-count-up: var(--motion-duration-count-up);",
    );
    expect(globalsCss).toContain(
      "--duration-draw-in: var(--motion-duration-draw-in);",
    );
    expect(globalsCss).toContain(
      "--duration-staged-process: var(--motion-duration-staged-process);",
    );
    expect(globalsCss).toContain(
      "--duration-hover-lift: var(--motion-duration-hover-lift);",
    );
    expect(globalsCss).toContain(
      "--duration-focus-bloom: var(--motion-duration-focus-bloom);",
    );
    expect(globalsCss).toContain(
      "--duration-marquee: var(--motion-duration-marquee);",
    );
    expect(globalsCss).toContain(
      "--default-transition-duration: var(--motion-duration-fast);",
    );
    expect(globalsCss).toContain(
      "--default-transition-timing-function: var(--motion-ease-out);",
    );
    expect(globalsCss).toContain("--ease-spring: var(--motion-ease-spring);");
    expect(globalsCss).toContain("var(--motion-duration-focus-bloom)");
    expect(globalsCss).toContain("var(--motion-ease-spring)");
    expect(globalsCss).toContain("var(--motion-duration-atmosphere)");
    expect(globalsCss).toContain(
      "var(--motion-ease-linear) infinite alternate",
    );
    expect(globalsCss).toContain(':root[data-motion="off"] .orb::before');
    expect(globalsCss).toContain(
      ':root[data-motion="off"] .auspex-wire__track',
    );
    expect(globalsCss).toContain(':root[data-motion="off"] .auspex-count-up');
    expect(globalsCss).toContain(':root[data-motion="off"] .auspex-stinger');
    expect(globalsCss).toContain(
      ':root[data-motion="off"] .auspex-vote-meter__fill',
    );
  });
});

function extractCssDeclarations(css: string): Record<string, string> {
  const declarations: Record<string, string> = {};

  for (const match of css.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) {
    declarations[match[1]] = match[2].trim();
  }

  return declarations;
}

function parseCssDurationMs(value: string | undefined): number {
  if (!value) {
    throw new Error("Missing CSS duration value");
  }

  const trimmed = value.trim();
  if (trimmed.endsWith("ms")) {
    return Number.parseFloat(trimmed);
  }
  if (trimmed.endsWith("s")) {
    return Number.parseFloat(trimmed) * 1000;
  }

  throw new Error(`Unsupported CSS duration "${value}"`);
}
