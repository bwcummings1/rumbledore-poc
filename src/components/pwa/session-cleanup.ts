"use client";

export const PWA_PAGE_CACHE_PREFIX = "rumbledore-pages-";
export const PWA_SIGN_OUT_MESSAGE = "RUMBLEDORE_SIGN_OUT";

type CacheStorageSubset = Pick<CacheStorage, "delete" | "keys">;
type ServiceWorkerContainerSubset = Pick<
  ServiceWorkerContainer,
  "controller" | "getRegistration" | "getRegistrations"
>;

function browserCaches(): CacheStorageSubset | null {
  return typeof caches === "undefined" ? null : caches;
}

function browserServiceWorker(): ServiceWorkerContainerSubset | null {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }
  return navigator.serviceWorker;
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

  const registrations = serviceWorker.getRegistrations
    ? await serviceWorker.getRegistrations()
    : await serviceWorker
        .getRegistration()
        .then((registration) => (registration ? [registration] : []));

  await Promise.all(
    registrations.map(async (registration) => {
      const subscription =
        (await registration.pushManager?.getSubscription()) ?? null;
      await subscription?.unsubscribe();
    }),
  );
}

async function swallowCleanupFailure(task: () => Promise<void>): Promise<void> {
  try {
    await task();
  } catch {
    // Sign-out must not be blocked by best-effort local browser cleanup.
  }
}

export async function clearPwaSessionState(): Promise<void> {
  await Promise.all([
    swallowCleanupFailure(() => clearPwaPageCaches()),
    swallowCleanupFailure(() => notifyServiceWorkerSignOut()),
    swallowCleanupFailure(() => unsubscribeBrowserPush()),
  ]);
}
