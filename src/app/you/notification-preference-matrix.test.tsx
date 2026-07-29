import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import {
  type LeagueNotificationPreference,
  NotificationPreferenceMatrix,
} from "./notification-preference-matrix";

const leagues: LeagueNotificationPreference[] = [
  {
    channels: { arena: "push", bets: "push", content: "digest", lore: "none" },
    leagueId: "00000000-0000-4000-8000-000000000001",
    name: "NHS Alumni Annual",
  },
  {
    channels: { arena: "none", bets: "digest", content: "push", lore: "push" },
    leagueId: "00000000-0000-4000-8000-000000000002",
    name: "Second League",
  },
];

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function leagueGroup(name: string) {
  return within(screen.getByRole("group", { name }));
}

test("the matrix seeds every league and family from saved preferences", () => {
  render(<NotificationPreferenceMatrix leagues={leagues} />);

  const first = leagueGroup("NHS Alumni Annual");
  expect((first.getByLabelText("Content") as HTMLSelectElement).value).toBe(
    "digest",
  );
  expect((first.getByLabelText("Lore") as HTMLSelectElement).value).toBe(
    "none",
  );

  const second = leagueGroup("Second League");
  expect((second.getByLabelText("Content") as HTMLSelectElement).value).toBe(
    "push",
  );
  expect((second.getByLabelText("Bets") as HTMLSelectElement).value).toBe(
    "digest",
  );
});

test("changing a channel PATCHes the existing push preferences API", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
  vi.stubGlobal("fetch", fetch);

  render(<NotificationPreferenceMatrix leagues={leagues} />);

  fireEvent.change(leagueGroup("NHS Alumni Annual").getByLabelText("Lore"), {
    target: { value: "digest" },
  });

  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  expect(fetch.mock.calls[0]?.[0]).toBe("/api/push/preferences");
  expect(fetch.mock.calls[0]?.[1]?.method).toBe("PATCH");
  expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual({
    channel: "digest",
    eventFamily: "lore",
    leagueId: "00000000-0000-4000-8000-000000000001",
  });

  expect(
    await screen.findByText("Lore now arrives by weekly digest."),
  ).toBeDefined();
});

test("a rejected save rolls the control back to the stored channel", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({}), { status: 403 }));
  vi.stubGlobal("fetch", fetch);

  render(<NotificationPreferenceMatrix leagues={leagues} />);

  const control = leagueGroup("NHS Alumni Annual").getByLabelText(
    "Arena",
  ) as HTMLSelectElement;
  fireEvent.change(control, { target: { value: "none" } });

  expect(
    await screen.findByText(
      "Notification preference could not be saved. Try again.",
    ),
  ).toBeDefined();
  await waitFor(() => expect(control.value).toBe("push"));
});

test("re-selecting the channel already stored sends no request", () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);

  render(<NotificationPreferenceMatrix leagues={leagues} />);

  fireEvent.change(leagueGroup("NHS Alumni Annual").getByLabelText("Bets"), {
    target: { value: "push" },
  });

  expect(fetch).not.toHaveBeenCalled();
});
