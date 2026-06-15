import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearPwaPageCaches,
  clearPwaSessionState,
  notifyServiceWorkerSignOut,
  PWA_SIGN_OUT_MESSAGE,
  unsubscribeBrowserPush,
} from "./session-cleanup";

afterEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as { caches?: unknown }).caches;
  delete (navigator as { serviceWorker?: unknown }).serviceWorker;
});

describe("PWA session cleanup", () => {
  it("deletes only versioned page caches", async () => {
    const cacheStorage = {
      delete: vi.fn().mockResolvedValue(true),
      keys: vi
        .fn()
        .mockResolvedValue([
          "rumbledore-shell-v2",
          "rumbledore-pages-v1",
          "rumbledore-pages-v2",
          "rumbledore-assets-v2",
        ]),
    } satisfies Pick<CacheStorage, "delete" | "keys">;

    await clearPwaPageCaches(cacheStorage);

    expect(cacheStorage.delete).toHaveBeenCalledTimes(2);
    expect(cacheStorage.delete).toHaveBeenCalledWith("rumbledore-pages-v1");
    expect(cacheStorage.delete).toHaveBeenCalledWith("rumbledore-pages-v2");
    expect(cacheStorage.delete).not.toHaveBeenCalledWith("rumbledore-shell-v2");
    expect(cacheStorage.delete).not.toHaveBeenCalledWith(
      "rumbledore-assets-v2",
    );
  });

  it("notifies controlled service workers that sign-out happened", async () => {
    const controller = { postMessage: vi.fn() } as unknown as ServiceWorker;
    const active = { postMessage: vi.fn() } as unknown as ServiceWorker;
    const serviceWorker = {
      controller,
      getRegistration: vi.fn().mockResolvedValue({ active }),
      getRegistrations: vi.fn().mockResolvedValue([]),
    } satisfies Pick<
      ServiceWorkerContainer,
      "controller" | "getRegistration" | "getRegistrations"
    >;

    await notifyServiceWorkerSignOut(serviceWorker);

    expect(controller.postMessage).toHaveBeenCalledWith({
      type: PWA_SIGN_OUT_MESSAGE,
    });
    expect(active.postMessage).toHaveBeenCalledWith({
      type: PWA_SIGN_OUT_MESSAGE,
    });
  });

  it("unsubscribes browser push registrations", async () => {
    const subscription = {
      unsubscribe: vi.fn().mockResolvedValue(true),
    } as unknown as PushSubscription;
    const pushManager = {
      getSubscription: vi.fn().mockResolvedValue(subscription),
    } as unknown as PushManager;
    const serviceWorker = {
      controller: null,
      getRegistration: vi.fn().mockResolvedValue(null),
      getRegistrations: vi.fn().mockResolvedValue([{ pushManager }]),
    } satisfies Pick<
      ServiceWorkerContainer,
      "controller" | "getRegistration" | "getRegistrations"
    >;

    await unsubscribeBrowserPush(serviceWorker);

    expect(pushManager.getSubscription).toHaveBeenCalled();
    expect(subscription.unsubscribe).toHaveBeenCalled();
  });

  it("keeps sign-out moving when one browser cleanup API fails", async () => {
    Object.defineProperty(globalThis, "caches", {
      configurable: true,
      value: {
        delete: vi.fn(),
        keys: vi.fn().mockRejectedValue(new Error("cache unavailable")),
      },
    });
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        controller: null,
        getRegistration: vi.fn().mockResolvedValue(null),
        getRegistrations: vi.fn().mockResolvedValue([]),
      },
    });

    await expect(clearPwaSessionState()).resolves.toBeUndefined();
  });
});
