import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  vi.unstubAllGlobals();
});

test("ESPN connect panel lists persisted discoveries and imports the selected default league", async () => {
  const importBodies: unknown[] = [];
  let discoveryReads = 0;
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString();
    if (url === "/api/onboarding/espn/discovered") {
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
    if (url === "/api/onboarding/espn/import") {
      importBodies.push(JSON.parse(init?.body?.toString() ?? "{}"));
      return jsonResponse({
        leagueId: "league-95050",
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
    expect(importBodies).toEqual([{ providerLeagueId: "95050", season: 2026 }]);
  });
  expect(await screen.findByText("Imported")).toBeDefined();
});
