import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AuspexAtmosphere } from "./atmosphere";

const repoRoot = path.join(__dirname, "..", "..");

afterEach(() => {
  cleanup();
});

describe("AUSPEX atmosphere foundation", () => {
  it("renders one decorative, non-interactive layer tree", () => {
    const { container } = render(<AuspexAtmosphere />);
    const root = container.querySelector('[data-slot="auspex-atmosphere"]');

    expect(root?.getAttribute("aria-hidden")).toBe("true");
    expect(root?.className).toBe("auspex-atmosphere");
    expect(
      Array.from(root?.querySelectorAll("[data-slot]") ?? []).map((node) =>
        node.getAttribute("data-slot"),
      ),
    ).toEqual([
      "auspex-atmosphere-starfield",
      "auspex-atmosphere-scanline",
      "auspex-atmosphere-grain",
      "auspex-atmosphere-vignette",
    ]);
    expect(root?.textContent).toBe("");
  });

  it("mounts the atmosphere behind the app content in the root layout", () => {
    const layoutSource = readFileSync(
      path.join(repoRoot, "src/app/layout.tsx"),
      "utf8",
    );

    expect(layoutSource).toContain(
      'import { AuspexAtmosphere } from "@/theme/atmosphere";',
    );
    expect(layoutSource).toContain("<AuspexAtmosphere />");
    expect(layoutSource).toContain('data-slot="app-content"');
    expect(layoutSource.indexOf("<AuspexAtmosphere />")).toBeLessThan(
      layoutSource.indexOf("<NavigationShell"),
    );
  });

  it("defines perf-safe starfield, scanline, grain, and vignette CSS", () => {
    const globalsCss = readGlobalsCss();

    expect(globalsCss).toContain(".auspex-atmosphere {");
    expect(globalsCss).toContain("position: fixed;");
    expect(globalsCss).toContain("inset: 0;");
    expect(globalsCss).toContain("pointer-events: none;");
    expect(globalsCss).toContain("contain: paint;");
    expect(globalsCss).toContain("z-index: 0;");
    expect(globalsCss).toContain(".auspex-atmosphere__starfield");
    expect(globalsCss).toContain(".auspex-atmosphere__scanline");
    expect(globalsCss).toContain(".auspex-atmosphere__grain");
    expect(globalsCss).toContain(".auspex-atmosphere__vignette");
    expect(globalsCss).toContain("radial-gradient");
    expect(globalsCss).toContain("repeating-linear-gradient");
    expect(globalsCss).toContain("var(--void, var(--background))");
    expect(globalsCss).toContain("var(--hair-3, var(--border))");
    expect(globalsCss).toContain("var(--motion-duration-atmosphere)");
    expect(globalsCss).toContain(
      "var(--motion-ease-linear) infinite alternate",
    );
    expect(globalsCss).toContain("@keyframes auspex-starfield-drift");
  });

  it("throttles drift on touch breakpoints and disables it for reduced motion", () => {
    const globalsCss = readGlobalsCss();

    expect(globalsCss).toContain("@media (max-width: 767px)");
    expect(globalsCss).toContain(
      "@media (min-width: 768px) and (max-width: 1023px)",
    );
    expect(globalsCss).toContain("@media (prefers-reduced-motion: reduce)");
    expect(extractBlock(globalsCss, "@media (max-width: 767px)")).toContain(
      "animation: none;",
    );
    expect(
      extractBlock(
        globalsCss,
        "@media (min-width: 768px) and (max-width: 1023px)",
      ),
    ).toContain("animation: none;");
    expect(
      extractBlock(globalsCss, "@media (prefers-reduced-motion: reduce)"),
    ).toContain("animation: none;");
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
