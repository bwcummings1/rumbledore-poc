// AUSPEX void background. Manifest and theme-color metadata require a hex color.
export const PWA_BACKGROUND_HEX = "#08090f";

/**
 * Literal colors for `src/app/global-error.tsx`.
 *
 * That boundary replaces the root layout, so the theme custom properties every
 * utility class reads are undefined by the time it renders — `panel` and
 * `text-ink-2` would resolve against nothing and the page would come out as
 * unstyled text.
 *
 * The alternative was to have it render `ThemeTokenStyle`, but that ships
 * `createThemeCss` and its formatters to every client on every route to style a
 * screen almost nobody ever sees; it pushed a route past the 300KB gzip budget
 * on its own. These values are the AUSPEX defaults from `src/theme/registry.ts`
 * frozen at their point of use, and they live here — beside the manifest color,
 * outside the view layer the token contract governs — for the same reason that
 * one does: a context CSS variables cannot reach.
 *
 * If the AUSPEX palette moves, these drift. That is the accepted cost, and the
 * blast radius is one fallback screen.
 */
export const GLOBAL_ERROR_FALLBACK = {
  accent: "#ff6b6b",
  background: PWA_BACKGROUND_HEX,
  border: "#262a3d",
  buttonBackground: "#7c6cf0",
  buttonText: "#f6f7fb",
  muted: "#9aa0b8",
  subtle: "#6b7192",
  text: "#e7e9f2",
} as const;
