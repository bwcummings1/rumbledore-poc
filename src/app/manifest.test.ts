import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "./manifest";

const publicDir = path.join(__dirname, "..", "..", "public");

describe("PWA manifest", () => {
  const m = manifest();

  it("has the fields Chrome requires for installability", () => {
    expect(m.name).toBe("Rumbledore");
    expect(m.start_url).toBe("/");
    expect(m.display).toBe("standalone");
    expect(m.theme_color).toMatch(/^#[0-9a-f]{6}$/);
    expect(m.background_color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("declares 192px and 512px icons plus a maskable variant", () => {
    const sizes = (m.icons ?? []).map((icon) => icon.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
    expect(m.icons?.some((icon) => icon.purpose === "maskable")).toBe(true);
  });

  it("points every icon at a real file in public/", () => {
    for (const icon of m.icons ?? []) {
      expect(
        existsSync(path.join(publicDir, icon.src)),
        `${icon.src} missing`,
      ).toBe(true);
    }
  });
});

describe("service worker", () => {
  it("ships an app-shell worker handling install/activate/fetch with an offline fallback", () => {
    const swPath = path.join(publicDir, "sw.js");
    expect(existsSync(swPath)).toBe(true);
    const sw = readFileSync(swPath, "utf8");
    for (const event of [
      "install",
      "activate",
      "fetch",
      "push",
      "notificationclick",
    ]) {
      expect(sw).toContain(`addEventListener("${event}"`);
    }
    expect(sw).toContain('"/offline"');
  });

  it("keeps runtime caches RLS-safe", () => {
    const sw = readFileSync(path.join(publicDir, "sw.js"), "utf8");
    expect(sw).toContain('const VERSION = "v2"');
    expect(sw).toContain('url.pathname.startsWith("/api/")');
    expect(sw).toContain('request.method !== "GET"');
    expect(sw).toContain("url.origin !== self.location.origin");
    expect(sw).toContain('request.headers.has("Authorization")');
    expect(sw).toContain('response.headers.get("Cache-Control")');
    expect(sw).toContain('response.headers.has("Vary")');
    expect(sw).toContain('cacheControl.includes("private")');
    expect(sw).toContain('cacheControl.includes("no-store")');
    expect(sw).toContain('request.credentials === "omit"');
  });

  it("supports sign-out page-cache clearing without deleting shell caches", () => {
    const sw = readFileSync(path.join(publicDir, "sw.js"), "utf8");
    expect(sw).toContain('const PAGES_CACHE_PREFIX = "rumbledore-pages-"');
    expect(sw).toContain('const SIGN_OUT_MESSAGE = "RUMBLEDORE_SIGN_OUT"');
    expect(sw).toContain("event.data?.type !== SIGN_OUT_MESSAGE");
    expect(sw).toContain("deleteCachesWithPrefix(PAGES_CACHE_PREFIX)");
  });
});
