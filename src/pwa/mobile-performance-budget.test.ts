import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import budget from "./mobile-performance-budget.json";

const repoRoot = path.join(__dirname, "..", "..");

describe("mobile PWA performance budget", () => {
  it("codifies the snappy mobile shell thresholds from specs/24", () => {
    expect(budget.thresholds.firstContentfulPaintMs).toBeLessThanOrEqual(1800);
    expect(budget.thresholds.repeatShellVisibleMs).toBeLessThanOrEqual(1000);
    expect(budget.thresholds.routeTransitionPerceivedMs).toBeLessThanOrEqual(
      300,
    );
    expect(budget.thresholds.cumulativeLayoutShift).toBeLessThanOrEqual(0.1);
    expect(budget.thresholds.interactionToNextPaintMs).toBeLessThanOrEqual(200);
    expect(budget.thresholds.minimumTapTargetPx).toBeGreaterThanOrEqual(44);
    expect(budget.thresholds.maxRouteJsGzipKb).toBeGreaterThan(0);
  });

  it("requires an App Router skeleton loading state instead of route spinners", () => {
    for (const loadingFile of [
      ...budget.loadingFiles,
      ...budget.routeLoadingFiles,
    ]) {
      const absolutePath = path.join(repoRoot, loadingFile);
      expect(existsSync(absolutePath), `${loadingFile} missing`).toBe(true);
      const source = readFileSync(absolutePath, "utf8");
      expect(source).toContain("MobileRouteSkeleton");
      expect(source).not.toMatch(/Loader2|animate-spin|spinner/iu);
    }

    const skeletonSource = readFileSync(
      path.join(repoRoot, "src/components/pwa/mobile-route-skeleton.tsx"),
      "utf8",
    );
    expect(skeletonSource).toContain('data-slot="mobile-route-skeleton"');
    expect(skeletonSource).toContain('aria-busy="true"');
    expect(skeletonSource).not.toMatch(/Loader2|animate-spin|spinner/iu);
  });

  it("tracks the data-backed mobile shell routes checked after build", () => {
    expect(budget.shellRoutes).toEqual(
      expect.arrayContaining([
        "/",
        "/you",
        "/arena",
        "/news",
        "/news/articles/[articleId]",
        "/leagues/[leagueId]",
        "/leagues/[leagueId]/bet",
        "/leagues/[leagueId]/members",
        "/leagues/[leagueId]/records",
      ]),
    );

    for (const route of budget.shellRoutes) {
      const pagePath =
        route === "/" ? "src/app/page.tsx" : `src/app${route}/page.tsx`;
      expect(
        existsSync(path.join(repoRoot, pagePath)),
        `${route} missing`,
      ).toBe(true);
    }
  });
});
