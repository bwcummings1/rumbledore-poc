import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LeagueCastTonePage from "./page";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  db: { kind: "db" },
  getLeagueToneProfileEditorData: vi.fn(),
  headers: vi.fn(),
  isValidLeagueId: vi.fn(),
  markLeagueOpened: vi.fn(),
  notFound: vi.fn((): never => {
    throw new Error("notFound");
  }),
  redirect: vi.fn((href: string): never => {
    throw new Error(`redirect:${href}`);
  }),
  requirePlatformAdmin: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: mocks.headers,
}));

vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
  redirect: mocks.redirect,
}));

vi.mock("@/ai", () => ({
  getLeagueToneProfileEditorData: mocks.getLeagueToneProfileEditorData,
}));

vi.mock("@/auth/guards", () => ({
  isValidLeagueId: mocks.isValidLeagueId,
  requirePlatformAdmin: mocks.requirePlatformAdmin,
}));

vi.mock("@/db", () => ({
  getDb: () => mocks.db,
}));

vi.mock("@/navigation/league-switcher-data", () => ({
  markLeagueOpened: mocks.markLeagueOpened,
}));

vi.mock("./persona-tone-editor-view", () => ({
  PersonaToneEditorView: () => <div>Platform tone editor</div>,
}));

const leagueId = "00000000-0000-4000-8000-000000000001";
const platformAdminUserId = "00000000-0000-4000-8000-000000000002";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.headers.mockResolvedValue(new Headers());
  mocks.isValidLeagueId.mockReturnValue(true);
});

afterEach(() => {
  cleanup();
});

describe("LeagueCastTonePage", () => {
  it("renders the tone editor for a platform admin", async () => {
    mocks.requirePlatformAdmin.mockResolvedValue({
      ok: true,
      value: {
        session: { user: { id: platformAdminUserId } },
        userId: platformAdminUserId,
      },
    });
    mocks.getLeagueToneProfileEditorData.mockResolvedValue({
      data: { cards: [], league: { id: leagueId } },
      status: "ready",
    });

    render(
      await LeagueCastTonePage({
        params: Promise.resolve({ leagueId }),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(screen.getByText("Platform tone editor")).toBeDefined();
    expect(mocks.requirePlatformAdmin).toHaveBeenCalledWith({
      db: mocks.db,
      headers: expect.any(Headers),
    });
    expect(mocks.getLeagueToneProfileEditorData).toHaveBeenCalledWith(
      mocks.db,
      { leagueId },
    );
  });

  it("rejects a league commissioner before tone config is loaded", async () => {
    mocks.requirePlatformAdmin.mockResolvedValue({
      error: {
        code: "PLATFORM_ADMIN_FORBIDDEN",
        message: "Platform administrator access is required",
        status: 403,
      },
      ok: false,
    });

    render(
      await LeagueCastTonePage({
        params: Promise.resolve({ leagueId }),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(
      screen.getByText("Platform administrator access required"),
    ).toBeDefined();
    expect(
      screen.getByText(
        "Persona tone is centrally curated and is not configurable per league.",
      ),
    ).toBeDefined();
    expect(mocks.getLeagueToneProfileEditorData).not.toHaveBeenCalled();
    expect(mocks.markLeagueOpened).not.toHaveBeenCalled();
  });
});
