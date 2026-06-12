import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { LeagueInviteView } from "./league-invite-view";

const clipboardWrite = vi.fn(async () => undefined);

Object.assign(navigator, {
  clipboard: {
    writeText: clipboardWrite,
  },
});

const initialSummary = {
  league: {
    id: "00000000-0000-4000-8000-000000000001",
    name: "NHS Alumni Annual",
    provider: "espn",
    providerLeagueId: "95050",
    season: 2026,
  },
  targets: [
    {
      displayName: "Fixture Manager Two",
      fantasyMemberId: "member-row-2",
      providerMemberId: "provider-member-2",
      providerTeamIds: ["2"],
      teamNames: ["Fixture Team 02"],
    },
  ],
  totals: {
    importedMembers: 2,
    inviteTargets: 1,
  },
};

afterEach(() => {
  vi.restoreAllMocks();
  clipboardWrite.mockClear();
});

test("invite view creates share links and records email sends", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
    async (_input, init) =>
      new Response(
        JSON.stringify({
          channel: JSON.parse(String(init?.body)).channel,
          expiresAt: "2026-07-12T12:00:00.000Z",
          inviteUrl:
            "https://rumbledore.example/invite/00000000-0000-4000-8000-000000000001/token",
          target: initialSummary.targets[0],
          targetHint: "m***@example.com",
          token: "token",
        }),
        {
          headers: { "content-type": "application/json" },
          status: 201,
        },
      ),
  );

  render(<LeagueInviteView initialSummary={initialSummary} />);

  expect(
    screen.getByRole("heading", { name: "NHS Alumni Annual" }),
  ).toBeDefined();
  expect(screen.getByText("Fixture Manager Two")).toBeDefined();
  expect(screen.getByText("Fixture Team 02")).toBeDefined();

  fireEvent.click(screen.getByRole("button", { name: "Link" }));

  await waitFor(() => {
    expect(clipboardWrite).toHaveBeenCalledWith(
      "https://rumbledore.example/invite/00000000-0000-4000-8000-000000000001/token",
    );
  });
  expect(
    screen.getByLabelText("Invite link for Fixture Manager Two"),
  ).toBeDefined();

  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "manager@example.com" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send email" }));

  await waitFor(() => {
    expect(
      screen.getByText("Email recorded for m***@example.com."),
    ).toBeDefined();
  });

  expect(fetchMock).toHaveBeenLastCalledWith(
    "/api/leagues/00000000-0000-4000-8000-000000000001/invites",
    expect.objectContaining({
      body: JSON.stringify({
        channel: "email",
        destination: "manager@example.com",
        providerMemberId: "provider-member-2",
      }),
      method: "POST",
    }),
  );
});
