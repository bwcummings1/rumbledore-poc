import type { FantasyProviderId } from "@/providers/ids";
import { FANTASY_PROVIDER_IDS } from "@/providers/ids";
import { getProviderBadgeLabel } from "./scope";

export type LeagueSwitcherRole =
  | "member"
  | "data_steward"
  | "league_admin"
  | "commissioner";

export interface LeagueSwitcherItem {
  readonly lastOpenedAt: Date | null;
  readonly leagueId: string;
  readonly logo: string | null;
  readonly name: string;
  readonly provider: FantasyProviderId;
  readonly providerLabel: string;
  readonly role: LeagueSwitcherRole;
}

export interface LeagueSwitcherViewItem
  extends Omit<LeagueSwitcherItem, "lastOpenedAt"> {
  readonly lastOpenedAt: string | null;
}

export interface LeagueSwitcherGroup<T extends LeagueSwitcherListItem> {
  readonly items: readonly T[];
  readonly provider: FantasyProviderId;
  readonly providerLabel: string;
}

export interface LeagueSwitcherConnectLink {
  readonly href: string;
  readonly label: string;
  readonly provider: FantasyProviderId;
}

export type LeagueSwitcherListItem = Omit<
  LeagueSwitcherItem,
  "lastOpenedAt"
> & {
  readonly lastOpenedAt: Date | string | null;
};

export const LEAGUE_SWITCHER_CONNECT_LINKS =
  FANTASY_PROVIDER_IDS.map<LeagueSwitcherConnectLink>((provider) => ({
    href: `/onboarding/${provider}`,
    label: getProviderBadgeLabel(provider),
    provider,
  }));

export function serializeLeagueSwitcherItem(
  item: LeagueSwitcherItem,
): LeagueSwitcherViewItem {
  return {
    ...item,
    lastOpenedAt: item.lastOpenedAt?.toISOString() ?? null,
  };
}

export function sortLeagueSwitcherItems<T extends LeagueSwitcherListItem>(
  items: readonly T[],
): T[] {
  return [...items].sort(compareLeagueSwitcherItems);
}

export function filterLeagueSwitcherItems<T extends LeagueSwitcherListItem>(
  items: readonly T[],
  query: string,
): T[] {
  const normalizedQuery = normalizeSearchText(query);
  if (normalizedQuery.length === 0) {
    return [...items];
  }

  return items.filter((item) => {
    const searchable = normalizeSearchText(
      `${item.name} ${item.provider} ${item.providerLabel}`,
    );
    return searchable.includes(normalizedQuery);
  });
}

export function groupLeagueSwitcherItems<T extends LeagueSwitcherListItem>(
  items: readonly T[],
): Array<LeagueSwitcherGroup<T>> {
  return FANTASY_PROVIDER_IDS.map((provider) => {
    const providerItems = items.filter((item) => item.provider === provider);
    return {
      items: providerItems,
      provider,
      providerLabel: getProviderBadgeLabel(provider),
    };
  }).filter((group) => group.items.length > 0);
}

export function getLeagueAvatarFallback(name: string): string {
  const words = name
    .trim()
    .split(/\s+/u)
    .map((word) => word.replace(/[^a-z0-9]/giu, ""))
    .filter((word) => word.length > 0);

  if (words.length === 0) {
    return "RL";
  }

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return `${words[0][0] ?? ""}${words[1][0] ?? ""}`.toUpperCase();
}

function compareLeagueSwitcherItems<T extends LeagueSwitcherListItem>(
  left: T,
  right: T,
): number {
  const leftOpenedAt = getLastOpenedTime(left.lastOpenedAt);
  const rightOpenedAt = getLastOpenedTime(right.lastOpenedAt);

  if (leftOpenedAt !== null && rightOpenedAt !== null) {
    const recency = rightOpenedAt - leftOpenedAt;
    if (recency !== 0) {
      return recency;
    }
  } else if (leftOpenedAt !== null) {
    return -1;
  } else if (rightOpenedAt !== null) {
    return 1;
  }

  const byName = left.name.localeCompare(right.name, undefined, {
    numeric: true,
    sensitivity: "base",
  });
  if (byName !== 0) {
    return byName;
  }

  return left.leagueId.localeCompare(right.leagueId);
}

function getLastOpenedTime(value: Date | string | null): number | null {
  if (!value) {
    return null;
  }

  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

function normalizeSearchText(value: string): string {
  return value.trim().toLocaleLowerCase();
}
