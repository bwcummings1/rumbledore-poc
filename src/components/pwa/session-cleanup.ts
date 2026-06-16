"use client";

export const PWA_PAGE_CACHE_PREFIX = "rumbledore-pages-";
export const PWA_SIGN_OUT_MESSAGE = "RUMBLEDORE_SIGN_OUT";
export const PUSH_ACCOUNT_CLEANUP_ENDPOINT = "/api/push/subscriptions/account";

type CacheStorageSubset = Pick<CacheStorage, "delete" | "keys">;
type ServiceWorkerContainerSubset = Pick<
  ServiceWorkerContainer,
  "controller" | "getRegistration" | "getRegistrations"
>;
type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

function browserCaches(): CacheStorageSubset | null {
  return typeof caches === "undefined" ? null : caches;
}

function browserServiceWorker(): ServiceWorkerContainerSubset | null {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }
  return navigator.serviceWorker;
}

function browserFetch(): FetchLike | null {
  return typeof fetch === "undefined" ? null : fetch.bind(globalThis);
}

async function browserPushRegistrations(
  serviceWorker: ServiceWorkerContainerSubset,
): Promise<readonly ServiceWorkerRegistration[]> {
  return serviceWorker.getRegistrations
    ? serviceWorker.getRegistrations()
    : serviceWorker
        .getRegistration()
        .then((registration) => (registration ? [registration] : []));
}

export async function clearPwaPageCaches(
  cacheStorage: CacheStorageSubset | null = browserCaches(),
): Promise<void> {
  if (!cacheStorage) {
    return;
  }

  const keys = await cacheStorage.keys();
  await Promise.all(
    keys
      .filter((key) => key.startsWith(PWA_PAGE_CACHE_PREFIX))
      .map((key) => cacheStorage.delete(key)),
  );
}

export async function notifyServiceWorkerSignOut(
  serviceWorker: ServiceWorkerContainerSubset | null = browserServiceWorker(),
): Promise<void> {
  if (!serviceWorker) {
    return;
  }

  const workers = new Set<ServiceWorker>();
  if (serviceWorker.controller) {
    workers.add(serviceWorker.controller);
  }

  const registration = await serviceWorker.getRegistration?.();
  for (const worker of [
    registration?.active,
    registration?.waiting,
    registration?.installing,
  ]) {
    if (worker) {
      workers.add(worker);
    }
  }

  for (const worker of workers) {
    worker.postMessage({ type: PWA_SIGN_OUT_MESSAGE });
  }
}

export async function unsubscribeBrowserPush(
  serviceWorker: ServiceWorkerContainerSubset | null = browserServiceWorker(),
): Promise<void> {
  if (!serviceWorker) {
    return;
  }

  const registrations = await browserPushRegistrations(serviceWorker);

  await Promise.all(
    registrations.map(async (registration) => {
      const subscription =
        (await registration.pushManager?.getSubscription()) ?? null;
      await subscription?.unsubscribe();
    }),
  );
}

export async function collectBrowserPushEndpoints(
  serviceWorker: ServiceWorkerContainerSubset | null = browserServiceWorker(),
): Promise<string[]> {
  if (!serviceWorker) {
    return [];
  }

  const registrations = await browserPushRegistrations(serviceWorker);
  const endpoints = new Set<string>();
  for (const registration of registrations) {
    const subscription =
      (await registration.pushManager?.getSubscription()) ?? null;
    if (subscription?.endpoint) {
      endpoints.add(subscription.endpoint);
    }
  }
  return [...endpoints].sort();
}

export async function disableServerPushSubscriptions(
  endpoints: readonly string[],
  fetchImpl: FetchLike | null = browserFetch(),
): Promise<void> {
  if (endpoints.length === 0 || !fetchImpl) {
    return;
  }

  await fetchImpl(PUSH_ACCOUNT_CLEANUP_ENDPOINT, {
    body: JSON.stringify({ endpoints }),
    headers: { "Content-Type": "application/json" },
    method: "DELETE",
  });
}

async function swallowCleanupFailure(task: () => Promise<void>): Promise<void> {
  try {
    await task();
  } catch {
    // Sign-out must not be blocked by best-effort local browser cleanup.
  }
}

async function swallowCleanupValue<T>(
  task: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await task();
  } catch {
    return fallback;
  }
}

export async function clearPwaSessionState(): Promise<void> {
  const serviceWorker = browserServiceWorker();
  const pushEndpoints = await swallowCleanupValue(
    () => collectBrowserPushEndpoints(serviceWorker),
    [],
  );
  await swallowCleanupFailure(() =>
    disableServerPushSubscriptions(pushEndpoints),
  );

  await Promise.all([
    swallowCleanupFailure(() => clearPwaPageCaches()),
    swallowCleanupFailure(() => notifyServiceWorkerSignOut(serviceWorker)),
    swallowCleanupFailure(() => unsubscribeBrowserPush(serviceWorker)),
  ]);
}
