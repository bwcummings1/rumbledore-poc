import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { YahooConnectPanel } from "./yahoo-connect-panel";

const discoveredLeague = {
  imported: false,
  isRecommendedImport: true,
  lastDiscoveredAt: "2026-06-12T00:00:00.000Z",
  name: "Yahoo Fixture League",
  provider: "yahoo",
  providerId: "461.l.95050",
  season: 2026,
  size: 4,
  sport: "ffl",
  teamName: "Yahoo Alpha",
} as const;

const oldLeague = {
  imported: false,
  isRecommendedImport: false,
  lastDiscoveredAt: "2026-06-12T00:00:00.000Z",
  name: "Yahoo Fixture League 2025",
  provider: "yahoo",
  providerId: "449.l.95050",
  season: 2025,
  size: 4,
  sport: "ffl",
  teamName: "Yahoo Alpha 2025",
} as const;

const yahooReconnect = {
  href: "/onboarding/yahoo",
  label: "Reconnect Yahoo",
  message: "Your Yahoo authorization expired before imports could run.",
  provider: "yahoo",
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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("Yahoo connect panel lists persisted discoveries and imports the selected default league", async () => {
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
                leagueId: "league-yahoo",
              },
              oldLeague,
            ],
      );
    }
    if (url === "/api/onboarding/import") {
      importBodies.push(parseRequestBody(init));
      return jsonResponse({
        leagueId: "league-yahoo",
        sync: {
          matchups: { total: 2 },
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

  render(<YahooConnectPanel />);

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
      { provider: "yahoo", providerLeagueId: "461.l.95050", season: 2026 },
    ]);
  });
  expect(await screen.findByText("Imported")).toBeDefined();
  const homeLink = screen.getByRole("link", {
    name: /open home/i,
  }) as HTMLAnchorElement;
  expect(homeLink.getAttribute("href")).toBe("/leagues/league-yahoo");
});

test("Yahoo connect panel blocks invalid stored credentials with a reconnect CTA", async () => {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = input.toString();
    if (url === "/api/onboarding/discovered") {
      return jsonResponse([
        {
          ...discoveredLeague,
          connectionState: "invalid",
          isRecommendedImport: false,
          reconnect: yahooReconnect,
        },
      ]);
    }
    return jsonResponse(
      { error: { message: `Unexpected request: ${url}` } },
      { status: 500 },
    );
  });
  vi.stubGlobal("fetch", fetchMock);

  render(<YahooConnectPanel />);

  const currentLeague = (await screen.findByRole("checkbox", {
    name: /yahoo fixture league/i,
  })) as HTMLInputElement;
  expect(currentLeague.checked).toBe(false);
  expect(currentLeague.disabled).toBe(true);
  expect(
    screen.getByText(/yahoo authorization expired before imports/i),
  ).toBeDefined();
  const reconnectLink = screen.getByRole("link", {
    name: /reconnect yahoo/i,
  }) as HTMLAnchorElement;
  expect(reconnectLink.getAttribute("href")).toBe("/onboarding/yahoo");
  expect(
    screen.getByRole("button", { name: /import selected/i }),
  ).toHaveProperty("disabled", true);
});
