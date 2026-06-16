// @vitest-environment node
import { describe, expect, it } from "vitest";
import { getThemeCssVariables, REGISTERED_THEMES } from "./registry";
import { neutralDarkTheme } from "./themes/neutral-dark";
import type { ColorAliasTokenName, ThemeDefinition } from "./types";

const BODY_TEXT_RATIO = 4.5;
const UI_TEXT_RATIO = 3;

type ContrastPair = {
  readonly foreground: ColorAliasTokenName;
  readonly background: ColorAliasTokenName;
  readonly minimumRatio: number;
  readonly usage: string;
};

type OklchColor = {
  readonly lightness: number;
  readonly chroma: number;
  readonly hueDegrees: number;
};

type ContrastViolation = {
  readonly themeId: string;
  readonly pair: string;
  readonly ratio: number;
  readonly minimumRatio: number;
  readonly usage: string;
};

const CONTRAST_PAIRS = [
  {
    foreground: "foreground",
    background: "background",
    minimumRatio: BODY_TEXT_RATIO,
    usage: "body text",
  },
  {
    foreground: "foreground",
    background: "surface",
    minimumRatio: BODY_TEXT_RATIO,
    usage: "body text",
  },
  {
    foreground: "foreground",
    background: "elevated",
    minimumRatio: BODY_TEXT_RATIO,
    usage: "body text",
  },
  {
    foreground: "card-foreground",
    background: "card",
    minimumRatio: BODY_TEXT_RATIO,
    usage: "body text",
  },
  {
    foreground: "popover-foreground",
    background: "popover",
    minimumRatio: BODY_TEXT_RATIO,
    usage: "body text",
  },
  {
    foreground: "muted-foreground",
    background: "muted",
    minimumRatio: BODY_TEXT_RATIO,
    usage: "muted body text",
  },
  {
    foreground: "muted-foreground",
    background: "surface",
    minimumRatio: BODY_TEXT_RATIO,
    usage: "muted body text",
  },
  {
    foreground: "secondary-foreground",
    background: "secondary",
    minimumRatio: BODY_TEXT_RATIO,
    usage: "secondary body text",
  },
  {
    foreground: "accent-foreground",
    background: "accent",
    minimumRatio: BODY_TEXT_RATIO,
    usage: "accent body text",
  },
  {
    foreground: "primary-foreground",
    background: "primary",
    minimumRatio: BODY_TEXT_RATIO,
    usage: "primary control text",
  },
  {
    foreground: "sidebar-foreground",
    background: "sidebar",
    minimumRatio: BODY_TEXT_RATIO,
    usage: "sidebar text",
  },
  {
    foreground: "sidebar-primary-foreground",
    background: "sidebar-primary",
    minimumRatio: BODY_TEXT_RATIO,
    usage: "sidebar primary control text",
  },
  ...stateSignalPairs("positive"),
  ...stateSignalPairs("negative"),
  ...stateSignalPairs("warning"),
  ...stateSignalPairs("highlight"),
] as const satisfies readonly ContrastPair[];

describe("theme token contrast", () => {
  it("satisfies WCAG contrast pairs for every registered theme", () => {
    const violations = REGISTERED_THEMES.flatMap(findContrastViolations);

    expect(violations, formatViolations(violations)).toEqual([]);
  });

  it("fails when a palette maps readable text to its background", () => {
    const badContrastTheme = {
      ...neutralDarkTheme,
      id: "bad-contrast",
      colorAliases: {
        ...neutralDarkTheme.colorAliases,
        foreground: "var(--background)",
      },
    } satisfies ThemeDefinition;

    expect(findContrastViolations(badContrastTheme)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pair: "foreground on background",
          themeId: "bad-contrast",
        }),
      ]),
    );
  });
});

function stateSignalPairs(
  foreground: "highlight" | "negative" | "positive" | "warning",
): readonly ContrastPair[] {
  return ["background", "surface", "elevated"].map((background) => ({
    foreground,
    background,
    minimumRatio: UI_TEXT_RATIO,
    usage: "state signal text",
  })) as readonly ContrastPair[];
}

function findContrastViolations(
  theme: ThemeDefinition,
): readonly ContrastViolation[] {
  const variables = getThemeCssVariables(theme);

  return CONTRAST_PAIRS.flatMap((pair) => {
    const foreground = parseOklch(
      resolveCssVariable(`var(--${pair.foreground})`, variables),
    );
    const background = parseOklch(
      resolveCssVariable(`var(--${pair.background})`, variables),
    );
    const ratio = contrastRatio(foreground, background);

    if (ratio >= pair.minimumRatio) {
      return [];
    }

    return [
      {
        themeId: theme.id,
        pair: `${pair.foreground} on ${pair.background}`,
        ratio,
        minimumRatio: pair.minimumRatio,
        usage: pair.usage,
      },
    ];
  });
}

function formatViolations(violations: readonly ContrastViolation[]): string {
  if (violations.length === 0) {
    return "No theme contrast violations.";
  }

  return violations
    .map(
      (violation) =>
        `${violation.themeId}: ${violation.pair} ${violation.ratio.toFixed(
          2,
        )}:1 < ${violation.minimumRatio.toFixed(1)}:1 (${violation.usage})`,
    )
    .join("\n");
}

function resolveCssVariable(
  value: string,
  variables: Record<string, string>,
  seen: ReadonlySet<string> = new Set(),
): string {
  const trimmed = value.trim();
  const variableMatch = /^var\(--([a-z0-9-]+)\)$/.exec(trimmed);

  if (!variableMatch) {
    return trimmed;
  }

  const variableName = variableMatch[1];
  if (seen.has(variableName)) {
    throw new Error(`Circular theme token reference for --${variableName}`);
  }

  const nextValue = variables[variableName];
  if (!nextValue) {
    throw new Error(`Theme token --${variableName} is not defined`);
  }

  return resolveCssVariable(
    nextValue,
    variables,
    new Set([...seen, variableName]),
  );
}

function parseOklch(value: string): OklchColor {
  const match =
    /^oklch\(\s*([0-9.]+%?)\s+([0-9.]+)\s+([0-9.]+)(?:deg)?(?:\s*\/\s*[0-9.]+%?)?\s*\)$/.exec(
      value,
    );

  if (!match) {
    throw new Error(`Expected resolved OKLCH color, received "${value}"`);
  }

  const [, lightnessValue, chromaValue, hueValue] = match;

  return {
    lightness: lightnessValue.endsWith("%")
      ? Number.parseFloat(lightnessValue) / 100
      : Number.parseFloat(lightnessValue),
    chroma: Number.parseFloat(chromaValue),
    hueDegrees: Number.parseFloat(hueValue),
  };
}

function contrastRatio(foreground: OklchColor, background: OklchColor): number {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);

  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance(color: OklchColor): number {
  const { red, green, blue } = oklchToLinearSrgb(color);

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function oklchToLinearSrgb(color: OklchColor): {
  readonly red: number;
  readonly green: number;
  readonly blue: number;
} {
  const hueRadians = (color.hueDegrees * Math.PI) / 180;
  const a = color.chroma * Math.cos(hueRadians);
  const b = color.chroma * Math.sin(hueRadians);

  const lPrime = color.lightness + 0.3963377774 * a + 0.2158037573 * b;
  const mPrime = color.lightness - 0.1055613458 * a - 0.0638541728 * b;
  const sPrime = color.lightness - 0.0894841775 * a - 1.291485548 * b;

  const l = lPrime ** 3;
  const m = mPrime ** 3;
  const s = sPrime ** 3;

  return {
    red: clamp01(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    green: clamp01(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    blue: clamp01(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
