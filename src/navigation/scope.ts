import {
  CENTRAL_PUBLICATION_SECTIONS,
  type CentralPublicationSectionId,
} from "@/news/sections";
import type { FantasyProviderId } from "@/providers/ids";

export type AppScopeId = "global" | "league" | "news" | "arena";

export type GlobalSectionId = "your-leagues" | "you";

export type LeagueSectionId =
  | "home"
  | "press"
  | "bet"
  | "data"
  | "ledger"
  | "records"
  | "lore"
  | "members";

export type NewsSectionId = "front" | CentralPublicationSectionId;

export type ArenaSectionId =
  | "leaderboard"
  | "leagues"
  | "movers"
  | "matchups"
  | "seasons"
  | "rules";

export type NavigationIconName =
  | "database"
  | "home"
  | "landmark"
  | "newspaper"
  | "trophy"
  | "user"
  | "scroll-text"
  | "ticket"
  | "book-open"
  | "users";

export interface GlobalNavigationSection {
  readonly href: string;
  readonly icon: NavigationIconName;
  readonly id: GlobalSectionId;
  readonly label: string;
  readonly scope: "global";
}

export interface LeagueNavigationSection {
  readonly icon: NavigationIconName;
  readonly id: LeagueSectionId;
  readonly label: string;
  readonly pathSegment: string;
  readonly scope: "league";
}

export interface LeagueNavigationLink extends LeagueNavigationSection {
  readonly href: string;
}

export interface NewsNavigationSection {
  readonly href: string;
  readonly icon: NavigationIconName;
  readonly id: NewsSectionId;
  readonly label: string;
  readonly scope: "news";
}

export interface ArenaNavigationSection {
  readonly href: string;
  readonly icon: NavigationIconName;
  readonly id: ArenaSectionId;
  readonly label: string;
  readonly scope: "arena";
}

export type ActiveNavigationState =
  | {
      readonly leagueId: null;
      readonly pathname: string;
      readonly scope: "global";
      readonly sectionId: GlobalSectionId | null;
    }
  | {
      readonly leagueId: null;
      readonly pathname: string;
      readonly scope: "news";
      readonly sectionId: NewsSectionId | null;
    }
  | {
      readonly leagueId: null;
      readonly pathname: string;
      readonly scope: "arena";
      readonly sectionId: ArenaSectionId | null;
    }
  | {
      readonly leagueId: string;
      readonly pathname: string;
      readonly scope: "league";
      readonly sectionId: LeagueSectionId | null;
    };

export const GLOBAL_NAVIGATION_SECTIONS = [
  {
    href: "/",
    icon: "home",
    id: "your-leagues",
    label: "Your Leagues",
    scope: "global",
  },
  {
    href: "/you",
    icon: "user",
    id: "you",
    label: "You",
    scope: "global",
  },
] as const satisfies readonly GlobalNavigationSection[];

export const LEAGUE_NAVIGATION_SECTIONS = [
  {
    icon: "home",
    id: "home",
    label: "Home",
    pathSegment: "",
    scope: "league",
  },
  {
    icon: "scroll-text",
    id: "press",
    label: "The Press",
    pathSegment: "press",
    scope: "league",
  },
  {
    icon: "ticket",
    id: "bet",
    label: "Bet",
    pathSegment: "bet",
    scope: "league",
  },
  {
    icon: "database",
    id: "data",
    label: "Data Book",
    pathSegment: "data",
    scope: "league",
  },
  {
    icon: "scroll-text",
    id: "ledger",
    label: "Edit Ledger",
    pathSegment: "ledger",
    scope: "league",
  },
  {
    icon: "book-open",
    id: "records",
    label: "Records",
    pathSegment: "records",
    scope: "league",
  },
  {
    icon: "landmark",
    id: "lore",
    label: "Lore",
    pathSegment: "lore",
    scope: "league",
  },
  {
    icon: "users",
    id: "members",
    label: "Members",
    pathSegment: "members",
    scope: "league",
  },
] as const satisfies readonly LeagueNavigationSection[];

export const NEWS_NAVIGATION_SECTIONS = [
  {
    href: "/news",
    icon: "newspaper",
    id: "front",
    label: "Front",
    scope: "news",
  },
  ...CENTRAL_PUBLICATION_SECTIONS.map((section) => ({
    href: `/news/${section.slug}`,
    icon: newsSectionIcon(section.id),
    id: section.id,
    label: section.label,
    scope: "news" as const,
  })),
] as const satisfies readonly NewsNavigationSection[];

export const ARENA_NAVIGATION_SECTIONS = [
  {
    href: "/arena",
    icon: "trophy",
    id: "leaderboard",
    label: "Leaderboard",
    scope: "arena",
  },
  {
    href: "/arena/leagues",
    icon: "users",
    id: "leagues",
    label: "League vs League",
    scope: "arena",
  },
  {
    href: "/arena/movers",
    icon: "ticket",
    id: "movers",
    label: "Movers",
    scope: "arena",
  },
  {
    href: "/arena/matchups",
    icon: "scroll-text",
    id: "matchups",
    label: "Matchups",
    scope: "arena",
  },
  {
    href: "/arena/seasons",
    icon: "book-open",
    id: "seasons",
    label: "Seasons",
    scope: "arena",
  },
  {
    href: "/arena/rules",
    icon: "landmark",
    id: "rules",
    label: "Rules",
    scope: "arena",
  },
] as const satisfies readonly ArenaNavigationSection[];

export const PROVIDER_BADGE_LABELS = {
  espn: "ESPN",
  sleeper: "Sleeper",
  yahoo: "Yahoo",
} as const satisfies Record<FantasyProviderId, string>;

const GLOBAL_SECTION_BY_SEGMENT: ReadonlyMap<string, GlobalSectionId> = new Map(
  GLOBAL_NAVIGATION_SECTIONS.map((section) => [
    section.href === "/" ? "" : section.href.slice(1),
    section.id,
  ]),
);

const LEAGUE_SECTION_BY_SEGMENT: ReadonlyMap<string, LeagueSectionId> = new Map(
  [
    ...LEAGUE_NAVIGATION_SECTIONS.map(
      (section) => [section.pathSegment, section.id] as const,
    ),
    ["cast", "press"],
    ["feed", "press"],
    ["posts", "press"],
    ["invite", "members"],
  ],
);

const NEWS_SECTION_BY_SEGMENT: ReadonlyMap<string, NewsSectionId> = new Map([
  ["", "front"],
  ["articles", "front"],
  ...NEWS_NAVIGATION_SECTIONS.map(
    (section) =>
      [
        section.id === "front" ? "" : section.href.slice("/news/".length),
        section.id,
      ] as const,
  ),
]);

const ARENA_SECTION_BY_SEGMENT: ReadonlyMap<string, ArenaSectionId> = new Map(
  ARENA_NAVIGATION_SECTIONS.map((section) => [
    section.href === "/arena" ? "" : section.href.slice("/arena/".length),
    section.id,
  ]),
);

export function getLeagueSectionHref(
  leagueId: string,
  sectionId: LeagueSectionId = "home",
): string {
  const section = LEAGUE_NAVIGATION_SECTIONS.find(
    (candidate) => candidate.id === sectionId,
  );
  if (!section) {
    return `/leagues/${encodeURIComponent(leagueId)}`;
  }

  const base = `/leagues/${encodeURIComponent(leagueId)}`;
  return section.pathSegment.length > 0
    ? `${base}/${section.pathSegment}`
    : base;
}

export function getNewsSectionHref(sectionId: NewsSectionId = "front"): string {
  return (
    NEWS_NAVIGATION_SECTIONS.find((section) => section.id === sectionId)
      ?.href ?? "/news"
  );
}

export function getArenaSectionHref(
  sectionId: ArenaSectionId = "leaderboard",
): string {
  return (
    ARENA_NAVIGATION_SECTIONS.find((section) => section.id === sectionId)
      ?.href ?? "/arena"
  );
}

export function getLeagueNavigationSections(
  leagueId: string,
): readonly LeagueNavigationLink[] {
  return LEAGUE_NAVIGATION_SECTIONS.map((section) => ({
    ...section,
    href: getLeagueSectionHref(leagueId, section.id),
  }));
}

export function getLeagueSwitchHref(
  targetLeagueId: string,
  activeState?: ActiveNavigationState,
): string {
  if (activeState?.scope === "league" && activeState.sectionId) {
    return getLeagueSectionHref(targetLeagueId, activeState.sectionId);
  }

  return getLeagueSectionHref(targetLeagueId, "home");
}

export function getProviderBadgeLabel(provider: FantasyProviderId): string {
  return PROVIDER_BADGE_LABELS[provider];
}

export function deriveActiveNavigationState(
  inputPathname: string | null | undefined,
): ActiveNavigationState {
  const pathname = normalizePathname(inputPathname);
  const segments = splitPathname(pathname);

  if (segments[0] === "leagues" && segments[1]) {
    const leagueId = decodePathSegment(segments[1]);
    const sectionSegment = segments[2]?.toLowerCase() ?? "";
    const sectionId = LEAGUE_SECTION_BY_SEGMENT.get(sectionSegment) ?? null;

    return {
      leagueId,
      pathname,
      scope: "league",
      sectionId,
    };
  }

  if (segments[0] === "news") {
    const sectionSegment = segments[1]?.toLowerCase() ?? "";
    const sectionId = NEWS_SECTION_BY_SEGMENT.get(sectionSegment) ?? null;

    return {
      leagueId: null,
      pathname,
      scope: "news",
      sectionId,
    };
  }

  if (segments[0] === "arena") {
    const sectionSegment = segments[1]?.toLowerCase() ?? "";
    const sectionId = ARENA_SECTION_BY_SEGMENT.get(sectionSegment) ?? null;

    return {
      leagueId: null,
      pathname,
      scope: "arena",
      sectionId,
    };
  }

  const globalSegment = segments[0]?.toLowerCase() ?? "";
  const sectionId = GLOBAL_SECTION_BY_SEGMENT.get(globalSegment) ?? null;

  return {
    leagueId: null,
    pathname,
    scope: "global",
    sectionId,
  };
}

function newsSectionIcon(
  sectionId: CentralPublicationSectionId,
): NavigationIconName {
  switch (sectionId) {
    case "analysis":
      return "scroll-text";
    case "headlines":
      return "newspaper";
    case "injuries":
      return "landmark";
    case "players":
      return "users";
    case "rankings":
      return "book-open";
    case "start-sit":
      return "ticket";
    case "waivers":
      return "trophy";
  }
}

function normalizePathname(inputPathname: string | null | undefined): string {
  const rawPathname = inputPathname?.trim() ?? "";
  let pathname = rawPathname.length > 0 ? rawPathname : "/";

  try {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(pathname)) {
      pathname = new URL(pathname).pathname;
    }
  } catch {
    pathname = rawPathname;
  }

  pathname = pathname.split(/[?#]/u, 1)[0] ?? "/";
  if (!pathname.startsWith("/")) {
    pathname = `/${pathname}`;
  }

  pathname = pathname.replace(/\/{2,}/gu, "/");
  if (pathname.length > 1 && pathname.endsWith("/")) {
    pathname = pathname.slice(0, -1);
  }

  return pathname;
}

function splitPathname(pathname: string): readonly string[] {
  return pathname
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

function decodePathSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}
