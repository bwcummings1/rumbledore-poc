import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { EspnConnectPanel } from "./espn-connect-panel";

const discoveredLeague = {
  imported: false,
  isRecommendedImport: true,
  lastDiscoveredAt: "2026-06-11T00:00:00.000Z",
  name: "NHS Alumni Annual",
  provider: "espn",
  providerId: "95050",
  season: 2026,
  size: 12,
  sport: "ffl",
  teamName: "Fixture Team",
} as const;

const oldLeague = {
  imported: false,
  isRecommendedImport: false,
  lastDiscoveredAt: "2026-06-11T00:00:00.000Z",
  name: "Old ESPN League",
  provider: "espn",
  providerId: "11111",
  season: 2025,
  size: 10,
  sport: "ffl",
} as const;

const espnReconnect = {
  href: "/onboarding/espn",
  label: "Reconnect ESPN",
  message: "Your ESPN connection needs fresh cookies before imports can run.",
  provider: "espn",
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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("ESPN connect panel lists persisted discoveries and imports the selected default league", async () => {
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
              { ...discoveredLeague, imported: true, leagueId: "league-95050" },
              oldLeague,
            ],
      );
    }
    if (url === "/api/onboarding/import") {
      importBodies.push(JSON.parse(init?.body?.toString() ?? "{}"));
      return jsonResponse({
        leagueId: "league-95050",
        leaguemateInvites: {
          importedMembers: 12,
          inviteTargets: 11,
          targets: [
            {
              displayName: "Fixture Manager Two",
              providerMemberId: "member-02",
              suggestedChannel: "share",
              teamNames: ["Fixture Team 02"],
            },
          ],
        },
        sync: {
          matchups: { total: 84 },
          members: { total: 16 },
          teams: { total: 12 },
        },
      });
    }
    return jsonResponse(
      { error: { message: `Unexpected request: ${url}` } },
      { status: 500 },
    );
  });
  vi.stubGlobal("fetch", fetchMock);

  render(<EspnConnectPanel />);

  const currentLeague = (await screen.findByRole("checkbox", {
    name: /nhs alumni annual/i,
  })) as HTMLInputElement;
  const oldLeagueCheckbox = screen.getByRole("checkbox", {
    name: /old espn league/i,
  }) as HTMLInputElement;

  expect(currentLeague.checked).toBe(true);
  expect(oldLeagueCheckbox.checked).toBe(false);

  fireEvent.click(screen.getByRole("button", { name: /import selected/i }));

  await waitFor(() => {
    expect(importBodies).toEqual([
      { provider: "espn", providerLeagueId: "95050", season: 2026 },
    ]);
  });
  expect(await screen.findByText("Imported")).toBeDefined();
  expect(
    await screen.findByText("We found your 11 leaguemates."),
  ).toBeDefined();
  const inviteLink = screen.getByRole("link", {
    name: /invite roster/i,
  }) as HTMLAnchorElement;
  expect(inviteLink.getAttribute("href")).toBe("/leagues/league-95050/members");
  const homeLink = screen.getByRole("link", {
    name: /open home/i,
  }) as HTMLAnchorElement;
  expect(homeLink.getAttribute("href")).toBe("/leagues/league-95050");
});

test("ESPN connect panel surfaces invite continuation links", async () => {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = input.toString();
    if (url === "/api/onboarding/discovered") {
      return jsonResponse([]);
    }
    return jsonResponse(
      { error: { message: `Unexpected request: ${url}` } },
      { status: 500 },
    );
  });
  vi.stubGlobal("fetch", fetchMock);

  render(<EspnConnectPanel returnTo="/invite/league/token" />);

  const returnLink = await screen.findByRole("link", {
    name: /return to invite/i,
  });
  expect(returnLink.getAttribute("href")).toBe("/invite/league/token");
});

test("ESPN connect panel blocks invalid stored credentials with a reconnect CTA", async () => {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = input.toString();
    if (url === "/api/onboarding/discovered") {
      return jsonResponse([
        {
          ...discoveredLeague,
          connectionState: "invalid",
          isRecommendedImport: false,
          reconnect: espnReconnect,
        },
      ]);
    }
    return jsonResponse(
      { error: { message: `Unexpected request: ${url}` } },
      { status: 500 },
    );
  });
  vi.stubGlobal("fetch", fetchMock);

  render(<EspnConnectPanel />);

  const currentLeague = (await screen.findByRole("checkbox", {
    name: /nhs alumni annual/i,
  })) as HTMLInputElement;
  expect(currentLeague.checked).toBe(false);
  expect(currentLeague.disabled).toBe(true);
  expect(
    screen.getByText(/espn connection needs fresh cookies/i),
  ).toBeDefined();
  const reconnectLink = screen.getByRole("link", {
    name: /reconnect espn/i,
  }) as HTMLAnchorElement;
  expect(reconnectLink.getAttribute("href")).toBe("/onboarding/espn");
  expect(
    screen.getByRole("button", { name: /import selected/i }),
  ).toHaveProperty("disabled", true);
});

test("ESPN connect panel renders reconnect CTA from import auth errors", async () => {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = input.toString();
    if (url === "/api/onboarding/discovered") {
      return jsonResponse([discoveredLeague]);
    }
    if (url === "/api/onboarding/import") {
      return jsonResponse(
        {
          error: {
            details: { reconnect: espnReconnect },
            message: espnReconnect.message,
          },
        },
        { status: 401 },
      );
    }
    return jsonResponse(
      { error: { message: `Unexpected request: ${url}` } },
      { status: 500 },
    );
  });
  vi.stubGlobal("fetch", fetchMock);

  render(<EspnConnectPanel />);

  await screen.findByRole("checkbox", { name: /nhs alumni annual/i });
  fireEvent.click(screen.getByRole("button", { name: /^import$/i }));

  expect(
    await screen.findByRole("link", { name: /reconnect espn/i }),
  ).toBeDefined();
});
