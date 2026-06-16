import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearPwaPageCaches,
  clearPwaSessionState,
  collectBrowserPushEndpoints,
  disableServerPushSubscriptions,
  notifyServiceWorkerSignOut,
  PUSH_ACCOUNT_CLEANUP_ENDPOINT,
  PWA_SIGN_OUT_MESSAGE,
  unsubscribeBrowserPush,
} from "./session-cleanup";

afterEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as { caches?: unknown }).caches;
  delete (globalThis as { fetch?: unknown }).fetch;
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
      endpoint: "https://push.example.test/sign-out",
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

  it("collects browser push endpoints from service worker registrations", async () => {
    const pushManager = {
      getSubscription: vi.fn().mockResolvedValue({
        endpoint: "https://push.example.test/sign-out",
      }),
    } as unknown as PushManager;
    const serviceWorker = {
      controller: null,
      getRegistration: vi.fn().mockResolvedValue(null),
      getRegistrations: vi.fn().mockResolvedValue([{ pushManager }]),
    } satisfies Pick<
      ServiceWorkerContainer,
      "controller" | "getRegistration" | "getRegistrations"
    >;

    await expect(collectBrowserPushEndpoints(serviceWorker)).resolves.toEqual([
      "https://push.example.test/sign-out",
    ]);
  });

  it("disables server push rows for browser endpoints", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null));

    await disableServerPushSubscriptions(
      ["https://push.example.test/sign-out"],
      fetchImpl,
    );

    expect(fetchImpl).toHaveBeenCalledWith(PUSH_ACCOUNT_CLEANUP_ENDPOINT, {
      body: JSON.stringify({
        endpoints: ["https://push.example.test/sign-out"],
      }),
      headers: { "Content-Type": "application/json" },
      method: "DELETE",
    });
  });

  it("cleans server push rows before unsubscribing browser push", async () => {
    const calls: string[] = [];
    const subscription = {
      endpoint: "https://push.example.test/sign-out",
      unsubscribe: vi.fn(async () => {
        calls.push("unsubscribe");
        return true;
      }),
    } as unknown as PushSubscription;
    const pushManager = {
      getSubscription: vi.fn().mockResolvedValue(subscription),
    } as unknown as PushManager;

    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: vi.fn(async () => {
        calls.push("server");
        return new Response(null);
      }),
    });
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        controller: null,
        getRegistration: vi.fn().mockResolvedValue(null),
        getRegistrations: vi.fn().mockResolvedValue([{ pushManager }]),
      },
    });

    await clearPwaSessionState();

    expect(calls).toEqual(["server", "unsubscribe"]);
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
