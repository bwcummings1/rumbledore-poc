import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "./page";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  getYourLeaguesLandingData: vi.fn(),
  headers: vi.fn(),
  redirect: vi.fn((href: string): never => {
    throw new Error(`redirect:${href}`);
  }),
  requireSession: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: mocks.headers,
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

vi.mock("@/auth/guards", () => ({
  requireSession: mocks.requireSession,
}));

vi.mock("@/db", () => ({
  getDb: mocks.getDb,
}));

vi.mock("@/home/your-leagues", () => ({
  getYourLeaguesLandingData: mocks.getYourLeaguesLandingData,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getDb.mockReturnValue({ kind: "db" });
  mocks.headers.mockResolvedValue(new Headers());
});

afterEach(() => {
  cleanup();
});

describe("Home route", () => {
  it("keeps logged-out users on the public connect landing", async () => {
    mocks.requireSession.mockResolvedValue({ ok: false });

    render(await Home());

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Your fantasy league becomes the show",
      }),
    ).toBeDefined();
    expect(mocks.getYourLeaguesLandingData).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("keeps signed-in users without leagues on the connect landing", async () => {
    mocks.requireSession.mockResolvedValue({
      ok: true,
      value: { session: { user: { id: "user-1" } }, userId: "user-1" },
    });
    mocks.getYourLeaguesLandingData.mockResolvedValue({ leagues: [] });

    render(await Home());

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Connect a league to open the lobby",
      }),
    ).toBeDefined();
    expect(mocks.getYourLeaguesLandingData).toHaveBeenCalledWith(
      { kind: "db" },
      { userId: "user-1" },
    );
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("sends signed-in users with leagues to central news", async () => {
    mocks.requireSession.mockResolvedValue({
      ok: true,
      value: { session: { user: { id: "user-1" } }, userId: "user-1" },
    });
    mocks.getYourLeaguesLandingData.mockResolvedValue({
      leagues: [{ leagueId: "league-1" }],
    });

    await expect(Home()).rejects.toThrow("redirect:/news");

    expect(mocks.redirect).toHaveBeenCalledWith("/news");
  });
});
