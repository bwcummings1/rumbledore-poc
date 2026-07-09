import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { LeagueWebhookManagerData } from "@/webhooks";
import { LeagueWebhookManagerView } from "./webhook-manager-view";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

const leagueId = "00000000-0000-4000-8000-000000000001";

const data: LeagueWebhookManagerData = {
  deliveries: [
    {
      contentItemId: "00000000-0000-4000-8000-000000000101",
      contentTitle: "Week 7 correction",
      createdAt: "2026-07-09T12:00:00.000Z",
      deliveryMode: "mock",
      deliveryStatus: "failed",
      errorMessage: "Mock webhook delivery failed",
      eventType: "content.corrected",
      id: "00000000-0000-4000-8000-000000000201",
      webhookId: "00000000-0000-4000-8000-000000000301",
      webhookName: "League Discord",
    },
  ],
  league: {
    id: leagueId,
    name: "Webhook League",
    provider: "espn",
    providerLeagueId: "95050",
    season: 2026,
  },
  summary: {
    active: 1,
    delivered: 12,
    disabled: 0,
    failed: 1,
  },
  webhooks: [
    {
      createdAt: "2026-07-09T11:00:00.000Z",
      eventSelection: {
        contentSections: ["recaps", "records"],
        events: ["content.published", "content.corrected"],
      },
      id: "00000000-0000-4000-8000-000000000301",
      lastDeliveryAt: "2026-07-09T11:30:00.000Z",
      lastFailureAt: "2026-07-09T12:00:00.000Z",
      name: "League Discord",
      status: "active",
      targetKind: "discord",
      updatedAt: "2026-07-09T11:00:00.000Z",
      urlHash: "redacted-url-hash",
      urlLabel: "discord.com / encrypted endpoint",
    },
  ],
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  router.refresh.mockClear();
});

test("LeagueWebhookManagerView renders targets, delivery failures, and actions", () => {
  render(<LeagueWebhookManagerView data={data} />);

  expect(
    screen.getByRole("heading", { level: 1, name: "The Webhook League Press" }),
  ).toBeDefined();
  expect(screen.getByText("DISTRIBUTION")).toBeDefined();
  expect(screen.getByText("mock delivery")).toBeDefined();
  expect(screen.getByText("discord.com / encrypted endpoint")).toBeDefined();
  expect(
    screen.getByText((text) => text.startsWith("Last delivered:")),
  ).toBeDefined();
  expect(screen.getByText("Mock webhook delivery failed")).toBeDefined();

  const targets = within(screen.getByLabelText("Webhook targets"));
  expect(
    targets.getByRole("heading", { name: "Configured endpoints" }),
  ).toBeDefined();
  expect(targets.getAllByRole("article")).toHaveLength(1);
  expect(screen.getByRole("button", { name: "Create target" })).toBeDefined();
  expect(screen.getByRole("button", { name: "Save target" })).toBeDefined();
  expect(screen.getByRole("button", { name: "Delete" })).toBeDefined();

  const log = within(screen.getByLabelText("Recent webhook deliveries"));
  expect(log.getByText("Week 7 correction")).toBeDefined();
  expect(log.getByText("content.corrected")).toBeDefined();
  expect(log.getByText("failed")).toBeDefined();
});

test("LeagueWebhookManagerView posts create requests and refreshes", async () => {
  const fetch = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        status: "created",
        webhook: { id: "webhook-created", name: "New Discord" },
      }),
      { status: 201 },
    ),
  );
  vi.stubGlobal("fetch", fetch);

  render(<LeagueWebhookManagerView data={data} />);

  const [createName] = screen.getAllByLabelText("Name");
  if (!createName) {
    throw new Error("create webhook name input was not rendered");
  }
  fireEvent.change(createName, {
    target: { value: "New Discord" },
  });
  fireEvent.change(screen.getByLabelText("Webhook URL"), {
    target: { value: "https://discord.com/api/webhooks/new-target" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create target" }));

  await waitFor(() => {
    expect(fetch).toHaveBeenCalledWith(
      `/api/leagues/${leagueId}/webhooks`,
      expect.objectContaining({
        method: "POST",
      }),
    );
  });
  expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toMatchObject({
    eventSelection: {
      contentSections: [
        "recaps",
        "power-rankings",
        "trash-talk",
        "records",
        "previews",
      ],
      events: ["content.published", "content.corrected"],
    },
    name: "New Discord",
    targetKind: "discord",
    url: "https://discord.com/api/webhooks/new-target",
  });
  await waitFor(() => expect(router.refresh).toHaveBeenCalled());
  expect(await screen.findByText("Webhook target created.")).toBeDefined();
});
