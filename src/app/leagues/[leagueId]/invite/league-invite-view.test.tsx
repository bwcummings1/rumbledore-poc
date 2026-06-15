import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { LeagueInviteView } from "./league-invite-view";

const clipboardWrite = vi.fn(async () => undefined);

Object.assign(navigator, {
  clipboard: {
    writeText: clipboardWrite,
  },
});

function firstElement<T>(elements: T[], label: string): T {
  const first = elements[0];
  if (!first) {
    throw new Error(`Expected ${label}`);
  }
  return first;
}

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
      suggestedChannel: "share" as const,
      teamNames: ["Fixture Team 02"],
    },
    {
      displayName: "Fixture Manager Three",
      fantasyMemberId: "member-row-3",
      providerMemberId: "provider-member-3",
      providerTeamIds: ["3"],
      suggestedChannel: "sms" as const,
      teamNames: ["Fixture Team 03"],
    },
  ],
  totals: {
    importedMembers: 3,
    inviteTargets: 2,
  },
};

afterEach(() => {
  vi.restoreAllMocks();
  clipboardWrite.mockClear();
});

test("invite view makes roster links and SMS the primary actions", async () => {
  const fetchMock = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      const target = initialSummary.targets.find(
        (candidate) => candidate.providerMemberId === body.providerMemberId,
      );
      if (!body.providerMemberId) {
        const generatedToken = ["open", "claim"].join("-");
        return new Response(
          JSON.stringify({
            channel: "share",
            expiresAt: "2026-07-12T12:00:00.000Z",
            inviteUrl:
              "https://rumbledore.example/invite/00000000-0000-4000-8000-000000000001/open-claim",
            target: null,
            targetHint: null,
            token: generatedToken,
          }),
          {
            headers: { "content-type": "application/json" },
            status: 201,
          },
        );
      }
      return new Response(
        JSON.stringify({
          channel: body.channel,
          expiresAt: "2026-07-12T12:00:00.000Z",
          inviteUrl: `https://rumbledore.example/invite/00000000-0000-4000-8000-000000000001/${body.providerMemberId}-${body.channel}`,
          target,
          targetHint:
            body.channel === "sms"
              ? "***4567"
              : body.channel === "email"
                ? "m***@example.com"
                : null,
          token: `${body.providerMemberId}-${body.channel}`,
        }),
        {
          headers: { "content-type": "application/json" },
          status: 201,
        },
      );
    });

  render(<LeagueInviteView initialSummary={initialSummary} />);

  expect(
    screen.getByRole("heading", { name: "NHS Alumni Annual" }),
  ).toBeDefined();
  expect(screen.getByText("Fixture Manager Two")).toBeDefined();
  expect(screen.getByText("Fixture Team 02")).toBeDefined();
  expect(screen.getByText("Start with a link")).toBeDefined();
  expect(screen.getByText("Start with SMS")).toBeDefined();
  expect(screen.queryByRole("button", { name: /send email/i })).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Copy claim link" }));

  await waitFor(() => {
    expect(clipboardWrite).toHaveBeenCalledWith(
      "https://rumbledore.example/invite/00000000-0000-4000-8000-000000000001/open-claim",
    );
  });
  expect(screen.getByLabelText("League claim link")).toBeDefined();
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/leagues/00000000-0000-4000-8000-000000000001/invites",
    expect.objectContaining({
      body: JSON.stringify({
        channel: "share",
      }),
      method: "POST",
    }),
  );

  fireEvent.click(screen.getByRole("button", { name: "Copy roster links" }));

  await waitFor(() => {
    expect(clipboardWrite).toHaveBeenCalledWith(
      [
        "Fixture Manager Two: https://rumbledore.example/invite/00000000-0000-4000-8000-000000000001/provider-member-2-share",
        "Fixture Manager Three: https://rumbledore.example/invite/00000000-0000-4000-8000-000000000001/provider-member-3-share",
      ].join("\n"),
    );
  });
  expect(
    screen.getByLabelText("Invite link for Fixture Manager Two"),
  ).toBeDefined();

  fireEvent.change(firstElement(screen.getAllByLabelText("SMS"), "SMS input"), {
    target: { value: "+1 (555) 123-4567" },
  });
  fireEvent.click(
    firstElement(
      screen.getAllByRole("button", { name: "Send SMS" }),
      "SMS submit button",
    ),
  );

  await waitFor(() => {
    expect(screen.getByText("SMS recorded for ***4567.")).toBeDefined();
  });

  expect(fetchMock).toHaveBeenLastCalledWith(
    "/api/leagues/00000000-0000-4000-8000-000000000001/invites",
    expect.objectContaining({
      body: JSON.stringify({
        channel: "sms",
        destination: "+1 (555) 123-4567",
        providerMemberId: "provider-member-2",
      }),
      method: "POST",
    }),
  );
});

test("invite view keeps email behind an entered-address fallback", async () => {
  const fetchMock = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          channel: body.channel,
          expiresAt: "2026-07-12T12:00:00.000Z",
          inviteUrl:
            "https://rumbledore.example/invite/00000000-0000-4000-8000-000000000001/provider-member-2-email",
          target: initialSummary.targets[0],
          targetHint: "m***@example.com",
          token: `${body.providerMemberId}-${body.channel}`,
        }),
        {
          headers: { "content-type": "application/json" },
          status: 201,
        },
      );
    });

  render(<LeagueInviteView initialSummary={initialSummary} />);

  fireEvent.click(
    firstElement(screen.getAllByText("Email address"), "email fallback button"),
  );
  fireEvent.change(
    firstElement(screen.getAllByLabelText("Email"), "email input"),
    {
      target: { value: "manager@example.com" },
    },
  );
  fireEvent.click(
    firstElement(
      screen.getAllByRole("button", { name: "Send email" }),
      "email submit button",
    ),
  );

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
