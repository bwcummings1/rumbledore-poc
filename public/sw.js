/**
 * Rumbledore service worker — offline app shell.
 * Bump VERSION when the caching strategy changes; content changes to this file
 * already trigger the browser's byte-diff update flow.
 */
const VERSION = "v1";
const SHELL_CACHE = `rumbledore-shell-${VERSION}`;
const PAGES_CACHE = `rumbledore-pages-${VERSION}`;
const ASSETS_CACHE = `rumbledore-assets-${VERSION}`;
const OFFLINE_URL = "/offline";
const PRECACHE = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  const keep = [SHELL_CACHE, PAGES_CACHE, ASSETS_CACHE];
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !keep.includes(key))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/** Navigations: fresh when online, cached page → offline shell when not. */
async function networkFirstPage(request) {
  const cache = await caches.open(PAGES_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached =
      (await cache.match(request)) ?? (await caches.match(OFFLINE_URL));
    return cached ?? Response.error();
  }
}

/** Immutable-per-deploy assets (hashed build output, icons): cache wins. */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(ASSETS_CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") {
    return;
  }
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }
  if (request.mode === "navigate") {
    event.respondWith(networkFirstPage(request));
    return;
  }
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/")
  ) {
    event.respondWith(cacheFirst(request));
  }
});

function safeNotificationPayload(event) {
  if (!event.data) {
    return {};
  }
  try {
    const payload = event.data.json();
    return payload && typeof payload === "object" ? payload : {};
  } catch {
    return {};
  }
}

self.addEventListener("push", (event) => {
  const payload = safeNotificationPayload(event);
  const title =
    typeof payload.title === "string" && payload.title.trim()
      ? payload.title
      : "Rumbledore";
  const body = typeof payload.body === "string" ? payload.body : "";
  const tag =
    typeof payload.tag === "string" && payload.tag.trim()
      ? payload.tag
      : "rumbledore-update";
  const url = typeof payload.url === "string" ? payload.url : "/";

  event.waitUntil(
    self.registration.showNotification(title, {
      badge: "/icons/icon-192.png",
      body,
      data: { url },
      icon: "/icons/icon-192.png",
      tag,
    }),
  );
});

async function focusOrOpenNotificationUrl(url) {
  const target = new URL(url, self.location.origin);
  if (target.origin !== self.location.origin) {
    target.href = self.location.origin;
  }

  const windows = await self.clients.matchAll({
    includeUncontrolled: true,
    type: "window",
  });
  for (const client of windows) {
    if ("focus" in client) {
      if ("navigate" in client && client.url !== target.href) {
        await client.navigate(target.href);
      }
      return client.focus();
    }
  }
  return self.clients.openWindow(target.href);
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    focusOrOpenNotificationUrl(event.notification.data?.url ?? "/"),
  );
});
