// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  getThemeCssVariables,
  getThemeExtensionCssVariables,
  REGISTERED_THEMES,
} from "./registry";
import { auspexTheme } from "./themes/auspex";
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

type LinearSrgbColor = {
  readonly red: number;
  readonly green: number;
  readonly blue: number;
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

describe("AUSPEX audited contrast pairs", () => {
  it("keeps ink and secondary ink readable on AUSPEX surfaces", () => {
    for (const foreground of ["ink", "ink-2"] as const) {
      for (const background of ["void", "hull", "hull-2"] as const) {
        expect(
          contrastByVariableName(foreground, background),
          `${foreground} on ${background}`,
        ).toBeGreaterThanOrEqual(BODY_TEXT_RATIO);
      }
    }
  });

  it("keeps tertiary ink large/UI-only and excludes decorative ink from text", () => {
    const tertiaryRatio = contrastByVariableName("ink-3", "hull-2");

    expect(tertiaryRatio).toBeGreaterThanOrEqual(UI_TEXT_RATIO);
    expect(tertiaryRatio).toBeLessThan(BODY_TEXT_RATIO);
    expect(contrastByVariableName("ink-4", "void")).toBeLessThan(UI_TEXT_RATIO);
  });

  it("keeps AUSPEX light accents readable as text on dark surfaces", () => {
    for (const foreground of [
      "lilac",
      "lilac-hi",
      "amber",
      "amber-deep",
      "steel",
      "steel-soft",
      "jade",
      "coral",
      "coral-deep",
    ] as const) {
      expect(
        contrastByVariableName(foreground, "hull-2"),
        `${foreground} on hull-2`,
      ).toBeGreaterThanOrEqual(BODY_TEXT_RATIO);
    }

    expect(contrastByVariableName("lilac-deep", "void")).toBeGreaterThanOrEqual(
      BODY_TEXT_RATIO,
    );
    for (const background of ["hull", "hull-2"] as const) {
      const ratio = contrastByVariableName("lilac-deep", background);

      expect(ratio, `lilac-deep on ${background}`).toBeGreaterThanOrEqual(
        UI_TEXT_RATIO,
      );
      expect(ratio, `lilac-deep on ${background}`).toBeLessThan(
        BODY_TEXT_RATIO,
      );
    }
  });

  it("uses void foreground on filled light accent controls", () => {
    for (const background of [
      "lilac",
      "amber",
      "steel-soft",
      "jade",
      "coral",
    ] as const) {
      expect(
        contrastByVariableName("void", background),
        `void on ${background}`,
      ).toBeGreaterThanOrEqual(BODY_TEXT_RATIO);
    }
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
  const variables = getContrastVariables(theme);

  return CONTRAST_PAIRS.flatMap((pair) => {
    const foreground = parseCssColor(
      resolveCssVariable(`var(--${pair.foreground})`, variables),
    );
    const background = parseCssColor(
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

function contrastByVariableName(
  foregroundName: string,
  backgroundName: string,
): number {
  const variables = getContrastVariables(auspexTheme);
  const foreground = parseCssColor(
    resolveCssVariable(`var(--${foregroundName})`, variables),
  );
  const background = parseCssColor(
    resolveCssVariable(`var(--${backgroundName})`, variables),
  );

  return contrastRatio(foreground, background);
}

function getContrastVariables(theme: ThemeDefinition): Record<string, string> {
  return {
    ...getThemeExtensionCssVariables(theme),
    ...getThemeCssVariables(theme),
  };
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

function parseCssColor(value: string): LinearSrgbColor {
  const trimmed = value.trim();

  if (trimmed.startsWith("#")) {
    return parseHexColor(trimmed);
  }

  if (/^rgba?\(/u.test(trimmed)) {
    return parseRgbColor(trimmed);
  }

  if (/^oklch\(/u.test(trimmed)) {
    return oklchToLinearSrgb(parseOklch(trimmed));
  }

  throw new Error(`Expected resolved CSS color, received "${value}"`);
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

function parseHexColor(value: string): LinearSrgbColor {
  const hex = value.slice(1);
  const normalized =
    hex.length === 3 || hex.length === 4
      ? [...hex.slice(0, 3)].map((digit) => digit + digit).join("")
      : hex.slice(0, 6);

  if (!/^[0-9a-fA-F]{6}$/u.test(normalized)) {
    throw new Error(`Unsupported hex color "${value}"`);
  }

  return {
    red: srgbChannelToLinear(Number.parseInt(normalized.slice(0, 2), 16) / 255),
    green: srgbChannelToLinear(
      Number.parseInt(normalized.slice(2, 4), 16) / 255,
    ),
    blue: srgbChannelToLinear(
      Number.parseInt(normalized.slice(4, 6), 16) / 255,
    ),
  };
}

function parseRgbColor(value: string): LinearSrgbColor {
  const match = /^rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)/u.exec(
    value,
  );

  if (!match) {
    throw new Error(`Unsupported rgb color "${value}"`);
  }

  return {
    red: srgbChannelToLinear(Number.parseFloat(match[1]) / 255),
    green: srgbChannelToLinear(Number.parseFloat(match[2]) / 255),
    blue: srgbChannelToLinear(Number.parseFloat(match[3]) / 255),
  };
}

function contrastRatio(
  foreground: LinearSrgbColor,
  background: LinearSrgbColor,
): number {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);

  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance(color: LinearSrgbColor): number {
  return 0.2126 * color.red + 0.7152 * color.green + 0.0722 * color.blue;
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

function srgbChannelToLinear(value: number): number {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
