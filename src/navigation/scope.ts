import type { FantasyProviderId } from "@/providers/ids";

export type AppScopeId = "global" | "league";

export type GlobalSectionId = "your-leagues" | "news" | "arena" | "you";

export type LeagueSectionId = "home" | "press" | "bet" | "records" | "members";

export type NavigationIconName =
  | "home"
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

export type ActiveNavigationState =
  | {
      readonly leagueId: null;
      readonly pathname: string;
      readonly scope: "global";
      readonly sectionId: GlobalSectionId | null;
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
    href: "/news",
    icon: "newspaper",
    id: "news",
    label: "News",
    scope: "global",
  },
  {
    href: "/arena",
    icon: "trophy",
    id: "arena",
    label: "Arena",
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
    icon: "book-open",
    id: "records",
    label: "Records",
    pathSegment: "records",
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
    ["feed", "press"],
    ["posts", "press"],
    ["invite", "members"],
  ],
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

  const globalSegment = segments[0]?.toLowerCase() ?? "";
  const sectionId = GLOBAL_SECTION_BY_SEGMENT.get(globalSegment) ?? null;

  return {
    leagueId: null,
    pathname,
    scope: "global",
    sectionId,
  };
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
