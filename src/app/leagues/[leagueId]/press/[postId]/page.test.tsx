import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LeaguePressPostPage from "./page";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  getLeagueFeedData: vi.fn(),
  getLeaguePressArticleData: vi.fn(),
  getLeaguePressArticleShareMetadata: vi.fn(),
  getLeaguePressArticleTeaserData: vi.fn(),
  getLeagueRouteShareMetadata: vi.fn(),
  headers: vi.fn(),
  markLeagueOpened: vi.fn(),
  notFound: vi.fn((): never => {
    throw new Error("notFound");
  }),
  redirect: vi.fn((href: string): never => {
    throw new Error(`redirect:${href}`);
  }),
  requireLeagueRole: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: mocks.headers,
}));

vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
  redirect: mocks.redirect,
}));

vi.mock("@/auth/guards", () => ({
  requireLeagueRole: mocks.requireLeagueRole,
}));

vi.mock("@/db", () => ({
  getDb: mocks.getDb,
}));

vi.mock("@/navigation/league-switcher-data", () => ({
  markLeagueOpened: mocks.markLeagueOpened,
}));

vi.mock("@/news", () => ({
  getLeagueFeedData: mocks.getLeagueFeedData,
  getLeaguePressArticleData: mocks.getLeaguePressArticleData,
  getLeaguePressArticleShareMetadata: mocks.getLeaguePressArticleShareMetadata,
  getLeaguePressArticleTeaserData: mocks.getLeaguePressArticleTeaserData,
  getLeagueRouteShareMetadata: mocks.getLeagueRouteShareMetadata,
}));

const leagueId = "00000000-0000-4000-8000-000000000001";
const postId = "00000000-0000-4000-8000-000000000101";

const teaserData = {
  article: {
    byline: "Rivalry Desk",
    bylineDetail: "Custom rivalry voice.",
    dek: "A public teaser dek.",
    headline: "Narrator opens a shared teaser",
    id: postId,
    lede: "Public lede for a shared visitor.",
    lifecycle: {
      status: "published" as const,
      statusChangedAt: "2026-06-11T20:00:00.000Z",
    },
    publishedAt: "2026-06-11T20:00:00.000Z",
    section: {
      href: `/leagues/${leagueId}/press/recaps`,
      label: "Recaps",
    },
  },
  articleHref: `/leagues/${leagueId}/press/${postId}`,
  league: {
    id: leagueId,
    name: "NHS Alumni Annual",
    provider: "espn" as const,
    providerLeagueId: "95050",
    season: 2026,
  },
  publicationHref: `/leagues/${leagueId}/press`,
  publicationLabel: "The NHS Alumni Annual Press",
  scope: "league" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getDb.mockReturnValue({ kind: "db" });
  mocks.headers.mockResolvedValue(new Headers());
});

afterEach(() => {
  cleanup();
});

describe("LeaguePressPostPage", () => {
  it("renders a logged-out article teaser without full body or member data", async () => {
    mocks.requireLeagueRole.mockResolvedValue({
      error: { code: "UNAUTHORIZED", status: 401 },
      ok: false,
    });
    mocks.getLeaguePressArticleTeaserData.mockResolvedValue({
      data: teaserData,
      status: "ready",
    });

    render(
      await LeaguePressPostPage({
        params: Promise.resolve({ leagueId, postId }),
        searchParams: Promise.resolve({ src: "chat" }),
      }),
    );

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Narrator opens a shared teaser",
      }),
    ).toBeDefined();
    expect(screen.getByText("Public lede for a shared visitor.")).toBeDefined();
    expect(screen.getByText("Claim your team")).toBeDefined();
    expect(
      screen.getByRole("link", { name: /claim team/i }).getAttribute("href"),
    ).toBe(
      `/onboarding/espn?returnTo=%2Fleagues%2F${leagueId}%2Fpress%2F${postId}%3Fsrc%3Dchat`,
    );
    expect(screen.queryByText(/Private second paragraph/i)).toBeNull();
    expect(screen.queryByText(/Manager One/i)).toBeNull();
    expect(mocks.getLeaguePressArticleData).not.toHaveBeenCalled();
    expect(mocks.markLeagueOpened).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("renders the logged-out retracted state without teaser copy", async () => {
    mocks.requireLeagueRole.mockResolvedValue({
      error: { code: "UNAUTHORIZED", status: 401 },
      ok: false,
    });
    mocks.getLeaguePressArticleTeaserData.mockResolvedValue({
      data: {
        ...teaserData,
        article: {
          ...teaserData.article,
          dek: "",
          headline: "No longer available",
          lede: "",
          lifecycle: {
            status: "retracted" as const,
            statusChangedAt: "2026-06-12T20:00:00.000Z",
          },
        },
      },
      status: "ready",
    });

    render(
      await LeaguePressPostPage({
        params: Promise.resolve({ leagueId, postId }),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(
      screen.getByRole("region", { name: "Retracted article" }),
    ).toBeDefined();
    expect(
      screen.getByText("This shared Press link is no longer available."),
    ).toBeDefined();
    expect(screen.queryByText("Public lede for a shared visitor.")).toBeNull();
  });
});
