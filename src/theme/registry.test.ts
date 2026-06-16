import { describe, expect, it } from "vitest";
import {
  createThemeCss,
  DEFAULT_THEME_ID,
  getDefaultTheme,
  getThemeById,
  getThemeCssVariables,
  getThemeExtensionCssVariables,
  REGISTERED_THEMES,
} from "./registry";
import { THEME_CSS_VARIABLE_NAMES, THEME_EXTENSION_TOKEN_NAMES } from "./types";

describe("theme registry", () => {
  it("registers AUSPEX as the default theme", () => {
    expect(DEFAULT_THEME_ID).toBe("auspex");
    expect(getDefaultTheme().id).toBe(DEFAULT_THEME_ID);
    expect(getThemeById(DEFAULT_THEME_ID)?.label).toBe("AUSPEX");
  });

  it("registers AUSPEX, the neutral fallback themes, and owner palette slots", () => {
    expect(REGISTERED_THEMES.map((theme) => theme.id)).toEqual([
      "auspex",
      "neutral-dark",
      "neutral-light",
      "palette-a",
      "palette-b",
    ]);
    expect(getThemeById("auspex")?.mode).toBe("dark");
    expect(getThemeById("neutral-dark")?.mode).toBe("dark");
    expect(getThemeById("neutral-light")?.mode).toBe("light");
    expect(getThemeById("palette-a")?.mode).toBe("dark");
    expect(getThemeById("palette-b")?.mode).toBe("dark");
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

  it("ports the full AUSPEX primitive variable set as theme extensions", () => {
    const auspex = requireTheme("auspex");
    const neutralDark = requireTheme("neutral-dark");

    expect(Object.keys(getThemeExtensionCssVariables(auspex)).sort()).toEqual(
      [...THEME_EXTENSION_TOKEN_NAMES].sort(),
    );
    expect(getThemeExtensionCssVariables(auspex).void).toBe("#08090F");
    expect(getThemeExtensionCssVariables(auspex).panel).toBe(
      "rgba(20,22,34,.62)",
    );
    expect(getThemeExtensionCssVariables(auspex).lilac).toBe("#A7A9EC");
    expect(getThemeExtensionCssVariables(auspex).bevel).toContain(
      "inset 0 1px 0",
    );
    expect(getThemeExtensionCssVariables(neutralDark)).toEqual({});
  });

  it("renders the default theme as root CSS variables", () => {
    const css = createThemeCss();

    expect(css).toContain(':root, [data-theme="auspex"]');
    expect(css).toContain('[data-theme="neutral-dark"]');
    expect(css).toContain('[data-theme="neutral-light"]');
    expect(css).toContain('[data-theme="palette-a"]');
    expect(css).toContain('[data-theme="palette-b"]');
    expect(css).toContain("color-scheme: dark;");
    expect(css).toContain("color-scheme: light;");
    expect(css).toContain("--void: #08090F;");
    expect(css).toContain("--panel: rgba(20,22,34,.62);");
    expect(css).toContain("--bevel: inset 0 1px 0");
    expect(css).toContain("--background: var(--void);");
    expect(css).toContain("--primitive-color-ink-950: oklch(16% 0.01 250);");
    expect(css).toContain("--primitive-color-ink-950: oklch(98% 0.006 250);");
    expect(css).toContain("--duration-fast: 150ms;");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });
});

function requireTheme(themeId: string) {
  const theme = getThemeById(themeId);

  if (!theme) {
    throw new Error(`Expected registered theme "${themeId}"`);
  }

  return theme;
}
