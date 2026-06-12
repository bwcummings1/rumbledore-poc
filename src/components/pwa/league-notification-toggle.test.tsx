import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEV_PUSH_PUBLIC_KEY } from "@/core/env/schema";
import { LeagueNotificationToggle } from "./league-notification-toggle";

const leagueId = "00000000-0000-4000-8000-000000000001";

function mockPushBrowser() {
  const subscription = {
    endpoint: "https://push.example.test/subscription",
    toJSON: () => ({
      endpoint: "https://push.example.test/subscription",
      expirationTime: null,
      keys: {
        auth: "auth-fixture",
        p256dh: "p256dh-fixture",
      },
    }),
  };
  const pushManager = {
    getSubscription: vi.fn().mockResolvedValue(null),
    subscribe: vi.fn().mockResolvedValue(subscription),
  };
  const registration = { pushManager };
  Object.defineProperty(window, "Notification", {
    configurable: true,
    value: {
      permission: "default",
      requestPermission: vi.fn().mockResolvedValue("granted"),
    },
  });
  Object.defineProperty(window, "PushManager", {
    configurable: true,
    value: function PushManager() {},
  });
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      getRegistration: vi.fn().mockResolvedValue(null),
      ready: Promise.resolve(registration),
      register: vi.fn().mockResolvedValue(registration),
    },
  });
  return { pushManager, registration, subscription };
}

afterEach(() => {
  delete (window as { Notification?: unknown }).Notification;
  delete (window as { PushManager?: unknown }).PushManager;
  delete (navigator as { serviceWorker?: unknown }).serviceWorker;
  vi.restoreAllMocks();
});

describe("LeagueNotificationToggle", () => {
  it("renders nothing when web push is unsupported", () => {
    const { container } = render(
      <LeagueNotificationToggle leagueId={leagueId} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("requests permission, subscribes, and saves the league subscription", async () => {
    const { pushManager } = mockPushBrowser();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ mock: true, publicKey: DEV_PUSH_PUBLIC_KEY }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "sub-id", status: "active" }), {
          status: 201,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<LeagueNotificationToggle leagueId={leagueId} />);

    const button = await screen.findByRole("button", { name: "Notify me" });
    fireEvent.click(button);

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Notifications on" }),
      ).toBeDefined(),
    );
    expect(pushManager.subscribe).toHaveBeenCalledWith({
      applicationServerKey: expect.any(ArrayBuffer),
      userVisibleOnly: true,
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/push/vapid-key",
      expect.objectContaining({
        cache: "no-store",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/push/subscriptions",
      expect.objectContaining({
        method: "POST",
      }),
    );
    const body = JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string);
    expect(body).toMatchObject({
      leagueId,
      subscription: {
        endpoint: "https://push.example.test/subscription",
        keys: {
          auth: "auth-fixture",
          p256dh: "p256dh-fixture",
        },
      },
    });
  });
});
