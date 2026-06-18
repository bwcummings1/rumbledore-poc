import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { ActiveNavigationState } from "@/navigation/scope";
import { AmbientAgentPanel } from "./ambient-agent-panel";

const leagueState = {
  leagueId: "00000000-0000-4000-8000-000000000041",
  pathname: "/leagues/00000000-0000-4000-8000-000000000041/records",
  scope: "league",
  sectionId: "records",
} satisfies ActiveNavigationState;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("ambient agent opens from the collapsed orb and renders a grounded answer", async () => {
  const fetchMock = vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json({
        answer: {
          citations: [
            {
              detail: "segment=playoff; era=Era 2 (2020, 2021, 2022, 2023)",
              href: "/leagues/00000000-0000-4000-8000-000000000041/records",
              label: "Curated Record Book",
            },
          ],
          generatedAt: "2026-06-15T12:00:00.000Z",
          question: "Who has the most playoff points in era 2?",
          scope: {
            kind: "league",
            leagueId: "00000000-0000-4000-8000-000000000041",
            leagueName: "NHS Alumni Annual",
          },
          suggestions: [],
          text: "Squyres18 owns the top playoff score in Era 2: 247.50 points.",
        },
        entitlement: {
          allowed: true,
          capability: "ai.individual.agent",
          caps: {
            aiPostsPerWeek: 25,
            individualLeaguesCovered: 10,
            maxPremiumLeaguesPerUser: null,
          },
          reason: "DEV_OVERRIDE",
          requiredTier: "individual",
          scope: "user",
          tier: "individual",
        },
        status: "ready",
      }),
  );
  vi.stubGlobal("fetch", fetchMock);

  render(
    <AmbientAgentPanel
      activeLeagueName="NHS Alumni Annual"
      activeState={leagueState}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "Open personal agent" }));
  const panel = screen.getByRole("dialog", {
    name: "WizKit personal agent",
  });
  expect(panel).toBeDefined();
  expect(panel.getAttribute("aria-modal")).toBeNull();
  expect(screen.getByText("Scope: NHS Alumni Annual")).toBeDefined();

  fireEvent.click(
    screen.getByRole("button", {
      name: "Who has the most playoff points in era 2?",
    }),
  );

  await waitFor(() => {
    expect(
      screen.getByText(/Squyres18 owns the top playoff score/i),
    ).toBeDefined();
  });
  expect(screen.getByText("Curated Record Book")).toBeDefined();
  const [, requestInit] = fetchMock.mock.calls[0] as [
    RequestInfo | URL,
    RequestInit,
  ];
  const body = JSON.parse(String(requestInit.body));
  expect(body).toMatchObject({
    context: {
      leagueId: leagueState.leagueId,
      pathname: leagueState.pathname,
      scope: "league",
      sectionId: "records",
    },
    question: "Who has the most playoff points in era 2?",
  });
});

test("ambient agent renders the gated state returned by the server", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        entitlement: {
          allowed: false,
          capability: "ai.individual.agent",
          caps: {
            aiPostsPerWeek: 25,
            individualLeaguesCovered: 10,
            maxPremiumLeaguesPerUser: null,
          },
          reason: "TIER_REQUIRED",
          requiredTier: "individual",
          scope: "user",
          tier: "none",
        },
        status: "blocked",
      }),
    ),
  );

  render(
    <AmbientAgentPanel
      activeLeagueName="NHS Alumni Annual"
      activeState={leagueState}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "Open personal agent" }));
  fireEvent.change(screen.getByLabelText("Ask the personal agent"), {
    target: { value: "Can I use WizKit?" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Send personal agent question" }),
  );

  await waitFor(() => {
    expect(
      screen.getByRole("heading", { name: "Get your personal agent" }),
    ).toBeDefined();
  });
  expect(screen.getByText("Individual tier required")).toBeDefined();
  expect(
    screen.getByRole("link", { name: /Review WizKit/i }).getAttribute("href"),
  ).toBe("/you#upgrade-options");
});

test("ambient agent closes with Escape", async () => {
  render(
    <AmbientAgentPanel
      activeLeagueName="NHS Alumni Annual"
      activeState={leagueState}
    />,
  );

  const trigger = screen.getByRole("button", { name: "Open personal agent" });
  fireEvent.click(trigger);
  expect(screen.getByRole("dialog")).toBeDefined();

  fireEvent.keyDown(document, { key: "Escape" });

  await waitFor(() => {
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
