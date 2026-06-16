import { describe, expect, it } from "vitest";
import {
  createThemeCss,
  DEFAULT_THEME_ID,
  getDefaultTheme,
  getThemeById,
  getThemeCssVariables,
  REGISTERED_THEMES,
} from "./registry";
import { THEME_CSS_VARIABLE_NAMES } from "./types";

describe("theme registry", () => {
  it("registers the neutral dark default theme", () => {
    expect(DEFAULT_THEME_ID).toBe("neutral-dark");
    expect(getDefaultTheme().id).toBe(DEFAULT_THEME_ID);
    expect(getThemeById(DEFAULT_THEME_ID)?.label).toBe("Neutral Dark");
  });

  it("requires every registered theme to provide the full token contract", () => {
    for (const theme of REGISTERED_THEMES) {
      const variables = getThemeCssVariables(theme);

      expect(Object.keys(variables).sort()).toEqual(
        [...THEME_CSS_VARIABLE_NAMES].sort(),
      );
      for (const name of THEME_CSS_VARIABLE_NAMES) {
        expect(variables[name], `${theme.id} --${name}`).toBeTruthy();
      }
    }
  });

  it("renders the default theme as root CSS variables", () => {
    const css = createThemeCss();

    expect(css).toContain(':root, [data-theme="neutral-dark"]');
    expect(css).toContain("color-scheme: dark;");
    expect(css).toContain("--primitive-color-ink-950: oklch(16% 0.01 250);");
    expect(css).toContain("--background: var(--primitive-color-ink-950);");
    expect(css).toContain("--duration-fast: 150ms;");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
