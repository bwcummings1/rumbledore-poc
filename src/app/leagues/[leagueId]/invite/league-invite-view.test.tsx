import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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
  cleanup();
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

test("invite view exposes the data steward doorway for commissioners", async () => {
  const fetchMock = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          steward: {
            displayName: "Fixture Manager Two",
            email: "two@example.com",
            isDataSteward: true,
            memberId: body.memberId,
            role: "data_steward",
            userId: "user-2",
          },
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      );
    });

  render(
    <LeagueInviteView
      initialSummary={initialSummary}
      stewardDoorway={{
        canAssignStewards: true,
        canOpenReview: true,
        publicLedger: {
          href: "/leagues/00000000-0000-4000-8000-000000000001/members/steward#public-ledger",
        },
        review: {
          href: "/leagues/00000000-0000-4000-8000-000000000001/members/steward#identity-review",
          latestFailureAt: "2026-06-15T12:00:00.000Z",
          needsReview: true,
          suggestedIdentityLinks: 1,
          unresolvedIntegrityChecks: 2,
        },
        stewardCandidates: [
          {
            displayName: "Fixture Manager Two",
            email: "two@example.com",
            isDataSteward: false,
            memberId: "member-row-2",
            role: "member",
            userId: "user-2",
          },
        ],
      }}
    />,
  );

  expect(screen.getByText("Data steward doorway")).toBeDefined();
  expect(
    screen.getByText("1 suggested identity link · 2 integrity flags"),
  ).toBeDefined();
  expect(
    screen
      .getByRole("link", { name: "Open public ledger" })
      .getAttribute("href"),
  ).toBe(
    "/leagues/00000000-0000-4000-8000-000000000001/members/steward#public-ledger",
  );
  expect(
    screen.getByRole("link", { name: "Open data review" }).getAttribute("href"),
  ).toBe(
    "/leagues/00000000-0000-4000-8000-000000000001/members/steward#identity-review",
  );

  fireEvent.click(screen.getByRole("button", { name: "Make steward" }));

  await waitFor(() => {
    expect(screen.getByText("Data steward")).toBeDefined();
  });
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/leagues/00000000-0000-4000-8000-000000000001/stewards",
    expect.objectContaining({
      body: JSON.stringify({ memberId: "member-row-2" }),
      method: "POST",
    }),
  );
});

test("ordinary members can reach the public data ledger without steward controls", () => {
  render(
    <LeagueInviteView
      initialSummary={initialSummary}
      stewardDoorway={{
        canAssignStewards: false,
        canOpenReview: false,
        publicLedger: {
          href: "/leagues/00000000-0000-4000-8000-000000000001/members/steward#public-ledger",
        },
        review: null,
        stewardCandidates: [],
      }}
    />,
  );

  expect(screen.getByText("Data transparency")).toBeDefined();
  expect(
    screen.getByText(
      "Every member can inspect the league-visible edit ledger.",
    ),
  ).toBeDefined();
  expect(
    screen
      .getByRole("link", { name: "Open public ledger" })
      .getAttribute("href"),
  ).toBe(
    "/leagues/00000000-0000-4000-8000-000000000001/members/steward#public-ledger",
  );
  expect(screen.queryByRole("link", { name: "Open data review" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Make steward" })).toBeNull();
});
