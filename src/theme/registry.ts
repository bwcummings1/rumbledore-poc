import { auspexTheme } from "./themes/auspex";
import { neutralDarkTheme } from "./themes/neutral-dark";
import { neutralLightTheme } from "./themes/neutral-light";
import { paletteATheme } from "./themes/palette-a";
import { paletteBTheme } from "./themes/palette-b";
import {
  type MotionTokenName,
  THEME_CSS_VARIABLE_NAMES,
  type ThemeDefinition,
  type TypeTokenName,
} from "./types";

export const DEFAULT_THEME_ID = auspexTheme.id;
export const REDUCED_MOTION_DURATION_MS = 1;
export const REDUCED_MOTION_DURATION_TOKENS = [
  "duration-fast",
  "duration-base",
  "duration-slow",
  "duration-orb",
  "duration-atmosphere",
  "duration-count-up",
  "duration-draw-in",
  "duration-staged-process",
  "duration-hover-lift",
  "duration-focus-bloom",
  "duration-marquee",
] as const satisfies readonly MotionTokenName[];

const REDUCED_MOTION_DURATION_ALIAS_TOKEN_NAMES = [
  "motion-duration-fast",
  "motion-duration-base",
  "motion-duration-slow",
  "motion-duration-orb",
  "motion-duration-atmosphere",
  "motion-duration-count-up",
  "motion-duration-draw-in",
  "motion-duration-staged-process",
  "motion-duration-hover-lift",
  "motion-duration-focus-bloom",
  "motion-duration-marquee",
] as const satisfies readonly MotionTokenName[];

export const REDUCED_MOTION_DURATION_ALIAS_TOKENS = {
  "motion-duration-fast": "duration-fast",
  "motion-duration-base": "duration-base",
  "motion-duration-slow": "duration-slow",
  "motion-duration-orb": "duration-orb",
  "motion-duration-atmosphere": "duration-atmosphere",
  "motion-duration-count-up": "duration-count-up",
  "motion-duration-draw-in": "duration-draw-in",
  "motion-duration-staged-process": "duration-staged-process",
  "motion-duration-hover-lift": "duration-hover-lift",
  "motion-duration-focus-bloom": "duration-focus-bloom",
  "motion-duration-marquee": "duration-marquee",
} as const satisfies Record<
  (typeof REDUCED_MOTION_DURATION_ALIAS_TOKEN_NAMES)[number],
  (typeof REDUCED_MOTION_DURATION_TOKENS)[number]
>;

export const REDUCED_MOTION_CSS_VARIABLE_NAMES = [
  ...REDUCED_MOTION_DURATION_TOKENS,
  ...REDUCED_MOTION_DURATION_ALIAS_TOKEN_NAMES,
] as const satisfies readonly MotionTokenName[];

export const REGISTERED_THEMES = [
  auspexTheme,
  neutralDarkTheme,
  neutralLightTheme,
  paletteATheme,
  paletteBTheme,
] as const;

export const RESPONSIVE_TYPE_SIZE_OVERRIDES = {
  "type-size-xl": "type-size-xl-mobile",
  "type-size-2xl": "type-size-2xl-mobile",
  "type-size-3xl": "type-size-3xl-mobile",
} as const satisfies Partial<Record<TypeTokenName, TypeTokenName>>;

export type RegisteredTheme = (typeof REGISTERED_THEMES)[number];
export type RegisteredThemeId = RegisteredTheme["id"];

const THEME_BY_ID = new Map<string, ThemeDefinition>(
  REGISTERED_THEMES.map((theme) => [theme.id, theme]),
);

export function getThemeById(themeId: string): ThemeDefinition | null {
  return THEME_BY_ID.get(themeId) ?? null;
}

export function isRegisteredThemeId(
  themeId: string | null | undefined,
): themeId is RegisteredThemeId {
  return typeof themeId === "string" && THEME_BY_ID.has(themeId);
}

export function coerceThemeId(
  themeId: string | null | undefined,
): RegisteredThemeId {
  return isRegisteredThemeId(themeId) ? themeId : DEFAULT_THEME_ID;
}

export function getDefaultTheme(): ThemeDefinition {
  return auspexTheme;
}

export function getThemeCssVariables(
  theme: ThemeDefinition,
): Record<string, string> {
  return {
    ...prefixVariables("primitive-color", theme.colorPrimitives),
    ...theme.colorAliases,
    ...theme.type,
    ...theme.space,
    ...theme.radius,
    ...theme.elevation,
    ...theme.motion,
  };
}

export function getThemeExtensionCssVariables(
  theme: ThemeDefinition,
): Record<string, string> {
  return theme.extensionVariables ?? {};
}

export function createThemeCss(
  themes: readonly ThemeDefinition[] = REGISTERED_THEMES,
): string {
  return [
    "/* Rumbledore theme tokens: generated from src/theme/registry.ts. */",
    ...themes.flatMap((theme) =>
      [formatThemeBlock(theme), formatThemeExtensionBlock(theme)].filter(
        Boolean,
      ),
    ),
    formatResponsiveTypeBlock(),
    formatMotionOffBlock(),
    formatReducedMotionBlock(),
  ].join("\n\n");
}

function formatThemeBlock(theme: ThemeDefinition): string {
  const selector =
    theme.id === DEFAULT_THEME_ID
      ? `:root, [data-theme="${theme.id}"]`
      : `[data-theme="${theme.id}"]`;
  const variables = getThemeCssVariables(theme);
  const lines = [
    `  color-scheme: ${theme.colorScheme};`,
    ...THEME_CSS_VARIABLE_NAMES.map(
      (name) => `  --${name}: ${variables[name]};`,
    ),
  ];

  return `${selector} {\n${lines.join("\n")}\n}`;
}

function formatThemeExtensionBlock(theme: ThemeDefinition): string {
  const variables = getThemeExtensionCssVariables(theme);
  const names = Object.keys(variables).sort();

  if (names.length === 0) {
    return "";
  }

  const lines = names.map((name) => `  --${name}: ${variables[name]};`);

  return `[data-theme="${theme.id}"] {\n${lines.join("\n")}\n}`;
}

export function getReducedMotionCssVariables(): Record<string, string> {
  return {
    ...Object.fromEntries(
      REDUCED_MOTION_DURATION_TOKENS.map((name) => [
        name,
        `${REDUCED_MOTION_DURATION_MS}ms`,
      ]),
    ),
    ...Object.fromEntries(
      Object.entries(REDUCED_MOTION_DURATION_ALIAS_TOKENS).map(
        ([alias, target]) => [alias, `var(--${target})`],
      ),
    ),
  };
}

function formatReducedMotionBlock(): string {
  const variables = getReducedMotionCssVariables();
  return [
    "@media (prefers-reduced-motion: reduce) {",
    "  :root {",
    ...REDUCED_MOTION_CSS_VARIABLE_NAMES.map(
      (name) => `    --${name}: ${variables[name]};`,
    ),
    "  }",
    "}",
  ].join("\n");
}

function formatMotionOffBlock(): string {
  const variables = getReducedMotionCssVariables();
  return [
    ':root[data-motion="off"] {',
    ...REDUCED_MOTION_CSS_VARIABLE_NAMES.map(
      (name) => `  --${name}: ${variables[name]};`,
    ),
    "}",
  ].join("\n");
}

function formatResponsiveTypeBlock(): string {
  return [
    "@media (max-width: 639px) {",
    "  :root {",
    ...Object.entries(RESPONSIVE_TYPE_SIZE_OVERRIDES).map(
      ([tokenName, mobileTokenName]) =>
        `    --${tokenName}: var(--${mobileTokenName});`,
    ),
    "  }",
    "}",
  ].join("\n");
}

function prefixVariables<TName extends string>(
  prefix: string,
  variables: Record<TName, string>,
): Record<`${typeof prefix}-${TName}`, string> {
  return Object.fromEntries(
    Object.entries(variables).map(([name, value]) => [
      `${prefix}-${name}`,
      value,
    ]),
  ) as Record<`${typeof prefix}-${TName}`, string>;
}
