// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  getThemeCssVariables,
  getThemeExtensionCssVariables,
} from "./registry";
import { auspexTheme } from "./themes/auspex";

const repoRoot = path.join(__dirname, "..", "..");

describe("AUSPEX signature primitives", () => {
  it("exposes signature visual tokens through the AUSPEX theme", () => {
    const variables = getThemeCssVariables(auspexTheme);
    const extensions = getThemeExtensionCssVariables(auspexTheme);

    expect(extensions["orb-fill"]).toContain("conic-gradient");
    expect(extensions["orb-shadow"]).toContain("--glow-lilac");
    expect(extensions["orb-shadow-think"]).toContain("rgba(199,123,208");
    expect(extensions["bezel-fill"]).toContain("linear-gradient");
    expect(extensions["bezel-fallback-ring"]).toBe("var(--line-2)");
    expect(extensions["glass-blur"]).toBe("16px");
    expect(extensions["glass-shadow"]).toContain("rgba(");
    expect(variables["duration-orb"]).toBe("7000ms");
    expect(variables["motion-duration-orb"]).toBe("var(--duration-orb)");
    expect(variables["ease-linear"]).toBe("linear");
    expect(variables["motion-ease-linear"]).toBe("var(--ease-linear)");
  });

  it("defines the AI orb utility, sizes, states, and reduced-motion fallback", () => {
    const globalsCss = readGlobalsCss();

    expect(globalsCss).toContain("@utility orb");
    expect(globalsCss).toContain("@utility orb-xs");
    expect(globalsCss).toContain("@utility orb-xl");
    expect(globalsCss).toContain(".orb::before");
    expect(globalsCss).toContain("animation: auspex-orb-spin");
    expect(globalsCss).toContain("var(--motion-duration-orb)");
    expect(globalsCss).toContain("var(--motion-ease-linear)");
    expect(globalsCss).toContain(".orb.think");
    expect(globalsCss).toContain('.orb[data-state="think"]');
    expect(globalsCss).toContain(".orb.muted");
    expect(globalsCss).toContain('.orb[data-state="offline"]');
    expect(globalsCss).toContain("@keyframes auspex-orb-spin");
    expect(
      extractBlock(globalsCss, "@media (prefers-reduced-motion: reduce)"),
    ).toContain(".orb::before");
    expect(
      extractBlock(globalsCss, "@media (prefers-reduced-motion: reduce)"),
    ).toContain("animation: none;");
  });

  it("defines the Y2K bezel and chip glyph with mask and solid-ring fallbacks", () => {
    const globalsCss = readGlobalsCss();

    expect(globalsCss).toContain("@utility bezel");
    expect(globalsCss).toContain("@utility chip-glyph");
    expect(globalsCss).toContain(".bezel::before");
    expect(globalsCss).toContain(".chip-glyph::before");
    expect(globalsCss).toContain("-webkit-mask-composite: xor;");
    expect(globalsCss).toContain("mask-composite: exclude;");
    expect(globalsCss).toContain(
      "@supports not ((mask-composite: exclude) or (-webkit-mask-composite: xor))",
    );
    expect(globalsCss).toContain(
      "border-color: var(--bezel-fallback-ring, var(--border));",
    );
  });

  it("defines the glass panel and cell utilities with blur and opaque fallbacks", () => {
    const globalsCss = readGlobalsCss();

    expect(globalsCss).toContain("@utility panel");
    expect(globalsCss).toContain("background: var(--panel, var(--surface));");
    expect(globalsCss).toContain(
      "box-shadow: var(--glass-shadow, var(--elevation-raised)), var(--bevel, none);",
    );
    expect(globalsCss).toContain("@utility cell");
    expect(globalsCss).toContain(
      "border: 1px solid var(--hair, var(--border));",
    );
    expect(globalsCss).toContain("@supports (");
    expect(globalsCss).toContain("(backdrop-filter: blur(1px)) or");
    expect(globalsCss).toContain("(-webkit-backdrop-filter: blur(1px))");
    expect(globalsCss).toContain(
      "-webkit-backdrop-filter: blur(var(--glass-blur, 0)) saturate(118%);",
    );
    expect(globalsCss).toContain(
      "backdrop-filter: blur(var(--glass-blur, 0)) saturate(118%);",
    );
    expect(globalsCss).toContain("@supports not (");
    expect(globalsCss).toContain(
      "background: var(--panel-solid, var(--surface));",
    );
    expect(extractBlock(globalsCss, "@media (max-width: 767px)")).toContain(
      "backdrop-filter: blur(10px) saturate(112%);",
    );
  });
});

function readGlobalsCss(): string {
  return readFileSync(path.join(repoRoot, "src/app/globals.css"), "utf8");
}

function extractBlock(source: string, marker: string): string {
  const start = source.indexOf(marker);
  if (start < 0) {
    return "";
  }

  const nextMedia = source.indexOf("\n@media", start + marker.length);
  return source.slice(start, nextMedia > start ? nextMedia : undefined);
}
