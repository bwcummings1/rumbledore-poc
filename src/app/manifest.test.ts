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
});
