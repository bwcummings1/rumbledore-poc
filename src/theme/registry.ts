import { neutralDarkTheme } from "./themes/neutral-dark";
import { neutralLightTheme } from "./themes/neutral-light";
import { paletteATheme } from "./themes/palette-a";
import { paletteBTheme } from "./themes/palette-b";
import { THEME_CSS_VARIABLE_NAMES, type ThemeDefinition } from "./types";

export const DEFAULT_THEME_ID = neutralDarkTheme.id;

export const REGISTERED_THEMES = [
  neutralDarkTheme,
  neutralLightTheme,
  paletteATheme,
  paletteBTheme,
] as const;

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
  return neutralDarkTheme;
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

export function createThemeCss(
  themes: readonly ThemeDefinition[] = REGISTERED_THEMES,
): string {
  return [
    "/* Rumbledore theme tokens: generated from src/theme/registry.ts. */",
    ...themes.map(formatThemeBlock),
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

function formatReducedMotionBlock(): string {
  return [
    "@media (prefers-reduced-motion: reduce) {",
    "  :root {",
    "    --duration-fast: 1ms;",
    "    --duration-base: 1ms;",
    "    --duration-slow: 1ms;",
    "    --motion-duration-fast: var(--duration-fast);",
    "    --motion-duration-base: var(--duration-base);",
    "    --motion-duration-slow: var(--duration-slow);",
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
