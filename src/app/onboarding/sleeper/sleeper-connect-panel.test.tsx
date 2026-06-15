import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { SleeperConnectPanel } from "./sleeper-connect-panel";

const discoveredLeague = {
  imported: false,
  isRecommendedImport: true,
  lastDiscoveredAt: "2026-06-12T00:00:00.000Z",
  name: "Sleeper Fixture League",
  provider: "sleeper",
  providerId: "sleeper-2026",
  season: 2026,
  size: 4,
  sport: "ffl",
} as const;

const oldLeague = {
  imported: false,
  isRecommendedImport: false,
  lastDiscoveredAt: "2026-06-12T00:00:00.000Z",
  name: "Sleeper Fixture League 2025",
  provider: "sleeper",
  providerId: "sleeper-2025",
  season: 2025,
  size: 4,
  sport: "ffl",
} as const;

const sleeperReconnect = {
  href: "/onboarding/sleeper",
  label: "Reconnect Sleeper",
  message:
    "Your Sleeper account lookup needs to be refreshed before imports can run.",
  provider: "sleeper",
} as const;

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      ...init,
      headers: {
        "content-type": "application/json",
        ...init.headers,
      },
    }),
  );
}

function parseRequestBody(init?: RequestInit): unknown {
  try {
    return JSON.parse(init?.body?.toString() ?? "{}") as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Expected JSON request body: ${message}`);
  }
}

function fixtureRowId(provider: string) {
  return `${provider}-row`;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("Sleeper connect panel lists persisted discoveries and imports the selected default league", async () => {
  const importBodies: unknown[] = [];
  let discoveryReads = 0;
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString();
    if (url === "/api/onboarding/discovered") {
      discoveryReads += 1;
      return jsonResponse(
        discoveryReads === 1
          ? [discoveredLeague, oldLeague]
          : [
              {
                ...discoveredLeague,
                imported: true,
                leagueId: "league-sleeper",
              },
              oldLeague,
            ],
      );
    }
    if (url === "/api/onboarding/import") {
      importBodies.push(parseRequestBody(init));
      return jsonResponse({
        leagueId: "league-sleeper",
        leaguemateInvites: {
          importedMembers: 4,
          inviteTargets: 3,
          targets: [
            {
              displayName: "Bravo Manager",
              providerMemberId: "user-2",
              suggestedChannel: "share",
              teamNames: ["Bravo Team"],
            },
          ],
        },
        sync: {
          matchups: { total: 4 },
          members: { total: 4 },
          teams: { total: 4 },
        },
      });
    }
    return jsonResponse(
      { error: { message: `Unexpected request: ${url}` } },
      { status: 500 },
    );
  });
  vi.stubGlobal("fetch", fetchMock);

  render(<SleeperConnectPanel />);

  const checkboxes = (await screen.findAllByRole(
    "checkbox",
  )) as HTMLInputElement[];
  const currentLeague = checkboxes[0];
  const oldLeagueCheckbox = checkboxes[1];

  expect(currentLeague?.checked).toBe(true);
  expect(oldLeagueCheckbox?.checked).toBe(false);

  fireEvent.click(screen.getByRole("button", { name: /import selected/i }));

  await waitFor(() => {
    expect(importBodies).toEqual([
      { provider: "sleeper", providerLeagueId: "sleeper-2026", season: 2026 },
    ]);
  });
  expect(await screen.findByText("Imported")).toBeDefined();
  expect(await screen.findByText("We found your 3 leaguemates.")).toBeDefined();
  const inviteLink = screen.getByRole("link", {
    name: /invite roster/i,
  }) as HTMLAnchorElement;
  expect(inviteLink.getAttribute("href")).toBe(
    "/leagues/league-sleeper/members",
  );
  const homeLink = screen.getByRole("link", {
    name: /open home/i,
  }) as HTMLAnchorElement;
  expect(homeLink.getAttribute("href")).toBe("/leagues/league-sleeper");
});

test("Sleeper connect panel posts public username discovery", async () => {
  const connectBodies: unknown[] = [];
  let discoveryReads = 0;
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString();
    if (url === "/api/onboarding/discovered") {
      discoveryReads += 1;
      return jsonResponse(discoveryReads === 1 ? [] : [discoveredLeague]);
    }
    if (url === "/api/onboarding/sleeper/connect") {
      connectBodies.push(parseRequestBody(init));
      return jsonResponse({
        credentialId: fixtureRowId("sleeper"),
        discoveredLeagues: [discoveredLeague],
      });
    }
    return jsonResponse(
      { error: { message: `Unexpected request: ${url}` } },
      { status: 500 },
    );
  });
  vi.stubGlobal("fetch", fetchMock);

  render(<SleeperConnectPanel />);

  fireEvent.change(
    screen.getByRole("textbox", { name: /username or user id/i }),
    {
      target: { value: "fixture_sleeper" },
    },
  );
  fireEvent.click(screen.getByRole("button", { name: /find leagues/i }));

  await waitFor(() => {
    expect(connectBodies).toEqual([{ usernameOrUserId: "fixture_sleeper" }]);
  });
  expect(await screen.findByText("Sleeper Fixture League")).toBeDefined();
});

test("Sleeper connect panel blocks invalid stored credentials with a reconnect CTA", async () => {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = input.toString();
    if (url === "/api/onboarding/discovered") {
      return jsonResponse([
        {
          ...discoveredLeague,
          connectionState: "invalid",
          isRecommendedImport: false,
          reconnect: sleeperReconnect,
        },
      ]);
    }
    return jsonResponse(
      { error: { message: `Unexpected request: ${url}` } },
      { status: 500 },
    );
  });
  vi.stubGlobal("fetch", fetchMock);

  render(<SleeperConnectPanel />);

  const currentLeague = (await screen.findByRole("checkbox", {
    name: /sleeper fixture league/i,
  })) as HTMLInputElement;
  expect(currentLeague.checked).toBe(false);
  expect(currentLeague.disabled).toBe(true);
  expect(
    screen.getByText(/sleeper account lookup needs to be refreshed/i),
  ).toBeDefined();
  const reconnectLink = screen.getByRole("link", {
    name: /reconnect sleeper/i,
  }) as HTMLAnchorElement;
  expect(reconnectLink.getAttribute("href")).toBe("/onboarding/sleeper");
  expect(
    screen.getByRole("button", { name: /import selected/i }),
  ).toHaveProperty("disabled", true);
});
