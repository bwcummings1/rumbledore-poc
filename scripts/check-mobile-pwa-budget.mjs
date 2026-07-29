import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";

const repoRoot = process.cwd();
const budgetPath = path.join(
  repoRoot,
  "src",
  "pwa",
  "mobile-performance-budget.json",
);
const appPathRoutesManifestPath = path.join(
  repoRoot,
  ".next",
  "app-path-routes-manifest.json",
);

/**
 * The specs/24 ceiling for per-route JS, in KB gzipped, and the only number the
 * gate trusts.
 *
 * `maxRouteJsGzipKb` in the budget file used to be checked only for being `>= 1`
 * — so the one threshold that measures a regression was the one threshold that
 * could not fail on one. Raising the budget to 900 satisfied `>= 1`, and every
 * route then "passed" against 900. The check now has a ceiling, and the measured
 * comparison below clamps to it so a tampered budget cannot buy headroom.
 */
const MAX_ROUTE_JS_GZIP_KB = 300;

function fail(message) {
  console.error(`mobile-pwa-budget: ${message}`);
  process.exitCode = 1;
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    fail(
      `${path.relative(repoRoot, filePath)} is not readable JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

function assertThresholds(budget) {
  const thresholds = budget.thresholds ?? {};
  const checks = [
    ["firstContentfulPaintMs", 1800, "max"],
    ["repeatShellVisibleMs", 1000, "max"],
    ["routeTransitionPerceivedMs", 300, "max"],
    ["cumulativeLayoutShift", 0.1, "max"],
    ["interactionToNextPaintMs", 200, "max"],
    ["minimumTapTargetPx", 44, "min"],
    ["maxRouteJsGzipKb", 1, "min"],
    ["maxRouteJsGzipKb", MAX_ROUTE_JS_GZIP_KB, "max"],
  ];

  for (const [key, limit, direction] of checks) {
    const value = thresholds[key];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      fail(`threshold ${key} must be a finite number`);
      continue;
    }
    if (direction === "max" && value > limit) {
      fail(`threshold ${key}=${value} exceeds specs/24 budget ${limit}`);
    }
    if (direction === "min" && value < limit) {
      fail(`threshold ${key}=${value} is below required floor ${limit}`);
    }
  }
}

function assertLoadingSkeletons(budget) {
  for (const loadingFile of [
    ...(budget.loadingFiles ?? []),
    ...(budget.routeLoadingFiles ?? []),
  ]) {
    const absolutePath = path.join(repoRoot, loadingFile);
    if (!existsSync(absolutePath)) {
      fail(`${loadingFile} is missing`);
      continue;
    }
    const source = readFileSync(absolutePath, "utf8");
    if (!source.includes("MobileRouteSkeleton")) {
      fail(`${loadingFile} must render MobileRouteSkeleton`);
    }
    if (/Loader2|animate-spin|spinner/iu.test(source)) {
      fail(`${loadingFile} must use skeletons instead of spinners`);
    }
  }

  const skeletonPath = path.join(
    repoRoot,
    "src",
    "components",
    "pwa",
    "mobile-route-skeleton.tsx",
  );
  if (!existsSync(skeletonPath)) {
    fail("src/components/pwa/mobile-route-skeleton.tsx is missing");
    return;
  }
  const skeleton = readFileSync(skeletonPath, "utf8");
  if (!skeleton.includes('data-slot="mobile-route-skeleton"')) {
    fail("mobile route skeleton needs a stable data-slot marker");
  }
  if (!skeleton.includes('aria-busy="true"')) {
    fail("mobile route skeleton must expose aria-busy");
  }
  if (/Loader2|animate-spin|spinner/iu.test(skeleton)) {
    fail("mobile route skeleton must not use spinner loading UI");
  }
}

function appManifestKeyForRoute(route) {
  if (route === "/") {
    return "/page";
  }
  return `${route}/page`;
}

function serverRouteDirForRoute(route) {
  if (route === "/") {
    return path.join(repoRoot, ".next", "server", "app", "page");
  }
  return path.join(repoRoot, ".next", "server", "app", route.slice(1), "page");
}

function clientReferenceManifestForRoute(route) {
  if (route === "/") {
    return path.join(
      repoRoot,
      ".next",
      "server",
      "app",
      "page_client-reference-manifest.js",
    );
  }
  return path.join(
    repoRoot,
    ".next",
    "server",
    "app",
    route.slice(1),
    "page_client-reference-manifest.js",
  );
}

function assertRouteFilesExist(budget) {
  for (const route of budget.shellRoutes ?? []) {
    const pagePath =
      route === "/" ? "src/app/page.tsx" : `src/app${route}/page.tsx`;
    if (!existsSync(path.join(repoRoot, pagePath))) {
      fail(`${route} points at missing ${pagePath}`);
    }
  }
}

function gzipSizeKbForFiles(files) {
  let totalBytes = 0;
  for (const file of files) {
    if (!file.endsWith(".js")) {
      continue;
    }
    const absolutePath = path.join(repoRoot, ".next", file);
    if (!existsSync(absolutePath)) {
      fail(`build manifest references missing chunk ${file}`);
      continue;
    }
    totalBytes += gzipSync(readFileSync(absolutePath)).byteLength;
  }
  return totalBytes / 1024;
}

function staticChunksForRoute(route) {
  const chunks = new Set();
  const routeDir = serverRouteDirForRoute(route);
  const buildManifestPath = path.join(routeDir, "build-manifest.json");
  if (!existsSync(buildManifestPath)) {
    fail(`${route} missing per-route build manifest at ${buildManifestPath}`);
    return chunks;
  }

  const buildManifest = readJsonFile(buildManifestPath);
  if (!buildManifest) {
    return chunks;
  }
  for (const file of buildManifest.rootMainFiles ?? []) {
    chunks.add(file);
  }

  const clientReferenceManifestPath = clientReferenceManifestForRoute(route);
  if (!existsSync(clientReferenceManifestPath)) {
    fail(
      `${route} missing client-reference manifest at ${clientReferenceManifestPath}`,
    );
    return chunks;
  }
  const clientReferenceManifest = readFileSync(
    clientReferenceManifestPath,
    "utf8",
  );
  for (const match of clientReferenceManifest.matchAll(
    /"(?:\/_next\/)?(static\/chunks\/[^"]+\.js)"/gu,
  )) {
    const chunk = match[1];
    if (chunk) {
      chunks.add(chunk);
    }
  }

  return chunks;
}

function assertBuiltRouteBudgets(budget) {
  if (!existsSync(appPathRoutesManifestPath)) {
    fail("run `pnpm build` before `pnpm perf:pwa`");
    return;
  }

  const appPathRoutes = readJsonFile(appPathRoutesManifestPath);
  if (!appPathRoutes) {
    return;
  }
  // Clamped, not read: `assertThresholds` already failed the run if the budget
  // file asks for more than the ceiling, but `fail()` only sets the exit code
  // and keeps going — without the clamp the run would go on to print
  // "route JS gzip sizes OK" against the inflated number.
  const declared = budget.thresholds?.maxRouteJsGzipKb;
  const maxRouteJsGzipKb =
    typeof declared === "number" && Number.isFinite(declared)
      ? Math.min(declared, MAX_ROUTE_JS_GZIP_KB)
      : MAX_ROUTE_JS_GZIP_KB;
  const routeReports = [];

  for (const route of budget.shellRoutes ?? []) {
    const key = appManifestKeyForRoute(route);
    if (appPathRoutes[key] !== route) {
      fail(`${route} missing from .next app-path-routes-manifest at ${key}`);
      continue;
    }
    const routeJsGzipKb = gzipSizeKbForFiles(staticChunksForRoute(route));
    routeReports.push([route, routeJsGzipKb]);
    if (routeJsGzipKb > maxRouteJsGzipKb) {
      fail(
        `${route} JS budget ${routeJsGzipKb.toFixed(1)}KB gzip exceeds ${maxRouteJsGzipKb}KB`,
      );
    }
  }

  const report = routeReports
    .map(([route, size]) => `${route}=${size.toFixed(1)}KB`)
    .join(", ");
  console.log(`mobile-pwa-budget: route JS gzip sizes OK (${report})`);
}

if (!existsSync(budgetPath)) {
  fail("src/pwa/mobile-performance-budget.json is missing");
} else {
  const budget = readJsonFile(budgetPath);
  if (budget) {
    assertThresholds(budget);
    assertLoadingSkeletons(budget);
    assertRouteFilesExist(budget);
    assertBuiltRouteBudgets(budget);
  }
}

if (process.exitCode) {
  const buildDir = path.join(repoRoot, ".next");
  if (existsSync(buildDir)) {
    const stats = statSync(buildDir);
    console.error(
      `mobile-pwa-budget: .next exists, modified ${stats.mtime.toISOString()}`,
    );
  }
  process.exit(process.exitCode);
}
