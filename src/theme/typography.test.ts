// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createThemeCss,
  getThemeCssVariables,
  getThemeExtensionCssVariables,
} from "./registry";
import { auspexTheme } from "./themes/auspex";

const repoRoot = path.join(__dirname, "..", "..");

describe("AUSPEX typography foundation", () => {
  it("loads the four AUSPEX font families through next/font variables", () => {
    const layoutSource = readFileSync(
      path.join(repoRoot, "src/app/layout.tsx"),
      "utf8",
    );
    const fontSource = readFileSync(
      path.join(repoRoot, "auspex-fonts.ts"),
      "utf8",
    );

    expect(fontSource).toContain(
      'import { Inter, JetBrains_Mono, Michroma, Saira } from "next/font/google";',
    );
    expect(fontSource).toContain('variable: "--font-michroma"');
    expect(fontSource).toContain('variable: "--font-saira"');
    expect(fontSource).toContain('variable: "--font-jetbrains-mono"');
    expect(fontSource).toContain('variable: "--font-inter"');
    expect(layoutSource).toContain(
      'import { auspexFontVariables } from "../../auspex-fonts";',
    );
    expect(layoutSource).toContain("auspexFontVariables");
    expect(layoutSource).toContain("initialTheme.mode");
    expect(layoutSource).not.toContain("Geist");
  });

  it("maps AUSPEX family roles and editorial scale into theme tokens", () => {
    const variables = getThemeCssVariables(auspexTheme);
    const extensions = getThemeExtensionCssVariables(auspexTheme);

    expect(extensions.head).toContain("--font-michroma");
    expect(extensions.disp).toContain("--font-saira");
    expect(extensions.mono).toContain("--font-jetbrains-mono");
    expect(extensions.body).toContain("--font-inter");
    expect(variables["font-family-heading"]).toBe("var(--head)");
    expect(variables["font-family-display"]).toBe("var(--disp)");
    expect(variables["font-family-body"]).toBe("var(--body)");
    expect(variables["type-size-3xl"]).toBe("3.25rem");
    expect(variables["type-size-3xl-mobile"]).toBe("2.5rem");
    expect(variables["heading-clip-fill"]).toBe(
      "linear-gradient(180deg, var(--foreground), var(--primary))",
    );
    expect(variables["prose-size"]).toBe("1.0625rem");
    expect(variables["prose-size-wide"]).toBe("1.1875rem");
    expect(variables["numeric-figure-spacing"]).toBe("tabular-nums");
  });

  it("emits breakpoint-based display type overrides", () => {
    const css = createThemeCss();

    expect(css).toContain("@media (max-width: 639px)");
    expect(css).toContain("--type-size-xl: var(--type-size-xl-mobile);");
    expect(css).toContain("--type-size-2xl: var(--type-size-2xl-mobile);");
    expect(css).toContain("--type-size-3xl: var(--type-size-3xl-mobile);");
  });

  it("exposes gradient heading, numeric, keyboard, and prose utilities", () => {
    const globalsCss = readFileSync(
      path.join(repoRoot, "src/app/globals.css"),
      "utf8",
    );

    expect(globalsCss).toContain("--font-display: var(--font-family-display);");
    expect(globalsCss).toContain("--font-body: var(--font-family-body);");
    expect(globalsCss).toContain("--text-3xl: var(--type-size-3xl);");
    expect(globalsCss).toContain("@utility h-grad");
    expect(globalsCss).toContain("color: var(--foreground);");
    expect(globalsCss).toContain("@supports ((-webkit-background-clip: text)");
    expect(globalsCss).toContain("background-image: var(--heading-clip-fill);");
    expect(globalsCss).toContain("@utility lcd");
    expect(globalsCss).toContain("text-shadow: var(--lcd-value-shadow);");
    expect(globalsCss).toContain("@utility metric");
    expect(globalsCss).toContain("@utility num");
    expect(globalsCss).toContain("@utility kbd");
    expect(globalsCss).toContain(".prose-auspex");
    expect(globalsCss).toContain("max-width: var(--prose-measure);");
  });
});
