export const COLOR_PRIMITIVE_TOKEN_NAMES = [
  "ink-950",
  "ink-900",
  "ink-850",
  "ink-700",
  "ink-300",
  "field-500",
  "field-950",
  "win-500",
  "loss-500",
  "flag-500",
  "live-500",
  "hairline",
  "focus-ring",
] as const;

export const COLOR_ALIAS_TOKEN_NAMES = [
  "background",
  "foreground",
  "surface",
  "elevated",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "positive",
  "negative",
  "warning",
  "highlight",
  "border",
  "input",
  "ring",
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
  "sidebar",
  "sidebar-foreground",
  "sidebar-primary",
  "sidebar-primary-foreground",
  "sidebar-accent",
  "sidebar-accent-foreground",
  "sidebar-border",
  "sidebar-ring",
] as const;

export const TYPE_TOKEN_NAMES = [
  "font-family-heading",
  "font-family-display",
  "font-family-sans",
  "font-family-body",
  "font-family-mono",
  "font-family-editorial",
  "type-size-xs",
  "type-line-xs",
  "type-size-sm",
  "type-line-sm",
  "type-size-base",
  "type-line-base",
  "type-size-lg",
  "type-line-lg",
  "type-size-xl",
  "type-line-xl",
  "type-size-2xl",
  "type-line-2xl",
  "type-size-3xl",
  "type-line-3xl",
  "type-size-xl-mobile",
  "type-size-2xl-mobile",
  "type-size-3xl-mobile",
  "numeric-figure-spacing",
  "heading-letter-spacing",
  "display-letter-spacing",
  "eyebrow-letter-spacing",
  "heading-clip-fill",
  "prose-size",
  "prose-size-wide",
  "prose-line",
  "prose-line-wide",
  "prose-measure",
  "prose-paragraph-spacing",
  "prose-pullquote-size",
  "lcd-value-shadow",
  "lcd-live-shadow",
] as const;

export const SPACE_TOKEN_NAMES = [
  "space-1",
  "space-2",
  "space-3",
  "space-4",
  "space-6",
  "space-8",
  "space-12",
] as const;

export const RADIUS_TOKEN_NAMES = [
  "radius",
  "radius-control",
  "radius-card",
  "radius-sheet",
  "control-radius",
  "card-radius",
  "sheet-radius",
] as const;

export const ELEVATION_TOKEN_NAMES = [
  "shadow-flat",
  "shadow-raised",
  "shadow-overlay",
  "elevation-flat",
  "elevation-raised",
  "elevation-overlay",
] as const;

export const MOTION_TOKEN_NAMES = [
  "duration-fast",
  "duration-base",
  "duration-slow",
  "motion-duration-fast",
  "motion-duration-base",
  "motion-duration-slow",
  "ease-out",
  "motion-ease-out",
] as const;

export const THEME_EXTENSION_TOKEN_NAMES = [
  "void",
  "void-2",
  "void-3",
  "hull",
  "hull-2",
  "hull-3",
  "panel",
  "panel-2",
  "panel-solid",
  "hair",
  "hair-2",
  "hair-3",
  "line",
  "line-2",
  "ink",
  "ink-2",
  "ink-3",
  "ink-4",
  "lilac",
  "lilac-hi",
  "lilac-deep",
  "amber",
  "amber-deep",
  "steel",
  "steel-soft",
  "jade",
  "coral",
  "coral-deep",
  "glow-lilac",
  "glow-amber",
  "bevel",
  "r-sm",
  "r-md",
  "r-lg",
  "disp",
  "head",
  "mono",
  "body",
] as const;

export const THEME_TOKEN_CATEGORIES = {
  colorPrimitives: COLOR_PRIMITIVE_TOKEN_NAMES,
  colorAliases: COLOR_ALIAS_TOKEN_NAMES,
  type: TYPE_TOKEN_NAMES,
  space: SPACE_TOKEN_NAMES,
  radius: RADIUS_TOKEN_NAMES,
  elevation: ELEVATION_TOKEN_NAMES,
  motion: MOTION_TOKEN_NAMES,
} as const;

export const THEME_CSS_VARIABLE_NAMES = [
  ...COLOR_PRIMITIVE_TOKEN_NAMES.map((name) => `primitive-color-${name}`),
  ...COLOR_ALIAS_TOKEN_NAMES,
  ...TYPE_TOKEN_NAMES,
  ...SPACE_TOKEN_NAMES,
  ...RADIUS_TOKEN_NAMES,
  ...ELEVATION_TOKEN_NAMES,
  ...MOTION_TOKEN_NAMES,
] as const;

export type ColorPrimitiveTokenName =
  (typeof COLOR_PRIMITIVE_TOKEN_NAMES)[number];
export type ColorAliasTokenName = (typeof COLOR_ALIAS_TOKEN_NAMES)[number];
export type TypeTokenName = (typeof TYPE_TOKEN_NAMES)[number];
export type SpaceTokenName = (typeof SPACE_TOKEN_NAMES)[number];
export type RadiusTokenName = (typeof RADIUS_TOKEN_NAMES)[number];
export type ElevationTokenName = (typeof ELEVATION_TOKEN_NAMES)[number];
export type MotionTokenName = (typeof MOTION_TOKEN_NAMES)[number];
export type ThemeExtensionTokenName =
  (typeof THEME_EXTENSION_TOKEN_NAMES)[number];
export type ThemeCssVariableName = (typeof THEME_CSS_VARIABLE_NAMES)[number];
export type ThemeMode = "dark" | "light";

export interface ThemeDefinition {
  readonly id: string;
  readonly label: string;
  readonly mode: ThemeMode;
  readonly colorScheme: ThemeMode;
  readonly colorPrimitives: Record<ColorPrimitiveTokenName, string>;
  readonly colorAliases: Record<ColorAliasTokenName, string>;
  readonly type: Record<TypeTokenName, string>;
  readonly space: Record<SpaceTokenName, string>;
  readonly radius: Record<RadiusTokenName, string>;
  readonly elevation: Record<ElevationTokenName, string>;
  readonly motion: Record<MotionTokenName, string>;
  readonly extensionVariables?: Record<ThemeExtensionTokenName, string>;
}
