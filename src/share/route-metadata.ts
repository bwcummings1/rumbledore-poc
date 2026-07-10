import type { Metadata } from "next";
import type { ArenaNavigationSection } from "@/navigation/scope";
import type {
  CentralArticleShareMetadata,
  LeagueArticleShareMetadata,
  LeagueRouteShareMetadata,
} from "@/news";
import type { PublicationSection } from "@/news/sections";
import type { LeagueInviteLanding } from "@/onboarding/invites";
import {
  buildShareMetadata,
  cleanShareText,
  unavailableShareMetadata,
} from "./metadata";

const CENTRAL_NEWS_DESCRIPTION =
  "League-agnostic NFL and fantasy-football headlines, tuned for Rumbledore leagues.";
const ARENA_DESCRIPTION =
  "Cross-league paper-betting leaderboards and rivalry movement from the Rumbledore Arena.";

export function centralNewsFrontMetadata(): Metadata {
  return buildShareMetadata({
    description: CENTRAL_NEWS_DESCRIPTION,
    image: {
      byline: "Central fantasy desk",
      headline: "Rumbledore News",
      kind: "section",
      section: "News front",
    },
    path: "/news",
    title: "Central News | Rumbledore",
  });
}

export function centralNewsSectionMetadata(
  section: PublicationSection,
): Metadata {
  return buildShareMetadata({
    description: `${section.label} from the Rumbledore central news desk.`,
    image: {
      byline: "Central fantasy desk",
      headline: `${section.label} Desk`,
      kind: "section",
      section: "Rumbledore News",
    },
    path: `/news/${section.slug}`,
    title: `${section.label} | Rumbledore News`,
  });
}

export function centralNewsArticleMetadata(
  article: CentralArticleShareMetadata,
): Metadata {
  const path = `/news/articles/${article.id}`;
  if (article.status !== "published") {
    return unavailableShareMetadata(path);
  }

  const description = cleanShareText(article.dek, 180);
  return buildShareMetadata({
    description,
    image: {
      byline: article.byline,
      hash: article.contentHash,
      headline: article.title,
      kind: "central_article",
      section: article.section.label,
      summary: description,
    },
    path,
    title: `${article.title} | Rumbledore News`,
    type: "article",
  });
}

export function leagueHomeMetadata(league: LeagueRouteShareMetadata): Metadata {
  return buildShareMetadata({
    description: `${league.name} on Rumbledore: league home, records, press, lore, and Arena context.`,
    image: {
      byline: `${league.season} fantasy football`,
      headline: league.name,
      kind: "league_home",
      leagueName: league.name,
      section: "League home",
    },
    path: `/leagues/${league.id}`,
    title: `${league.name} | Rumbledore`,
  });
}

export function leaguePressFrontMetadata(
  league: LeagueRouteShareMetadata,
): Metadata {
  return buildShareMetadata({
    description: `The Rumbledore Press desk for ${league.name}.`,
    image: {
      byline: "The Rumbledore cast",
      headline: "The Press",
      kind: "section",
      leagueName: league.name,
      section: "League press",
    },
    path: `/leagues/${league.id}/press`,
    title: `${league.name} Press | Rumbledore`,
  });
}

export function leaguePressSectionMetadata(
  league: LeagueRouteShareMetadata,
  section: PublicationSection,
): Metadata {
  return buildShareMetadata({
    description: `${section.label} from the Rumbledore Press desk for ${league.name}.`,
    image: {
      byline: "The Rumbledore cast",
      headline: section.label,
      kind: "section",
      leagueName: league.name,
      section: "League press",
    },
    path: `/leagues/${league.id}/press/${section.slug}`,
    title: `${section.label} | ${league.name} Press`,
  });
}

export function leagueArticleMetadata(
  article: LeagueArticleShareMetadata,
  path = `/leagues/${article.league.id}/press/${article.id}`,
): Metadata {
  if (article.status !== "published") {
    return unavailableShareMetadata(path);
  }

  return buildShareMetadata({
    description: `${article.byline} filed a Rumbledore Press piece for ${article.league.name}.`,
    image: {
      byline: article.byline,
      hash: article.contentHash,
      headline: article.title,
      kind: "league_article",
      leagueName: article.league.name,
      section: article.section.label,
    },
    noIndex: true,
    path,
    title: `${article.title} | ${article.league.name}`,
    type: "article",
  });
}

export function inviteShareMetadata(
  invite: LeagueInviteLanding,
  path: string,
): Metadata {
  return buildShareMetadata({
    description: `${invite.league.season} fantasy football invite. Claim your team in Rumbledore.`,
    image: {
      byline: "League invite",
      headline: `Join ${invite.league.name}`,
      kind: "invite",
      leagueName: invite.league.name,
      section: "Claim your team",
    },
    path,
    title: `Join ${invite.league.name} | Rumbledore`,
  });
}

export function arenaShareMetadata(
  section: Pick<ArenaNavigationSection, "href" | "label">,
): Metadata {
  return buildShareMetadata({
    description: ARENA_DESCRIPTION,
    image: {
      byline: "Central arena",
      headline: section.href === "/arena" ? "Rumbledore Arena" : section.label,
      kind: "arena",
      section: section.label,
    },
    path: section.href,
    title:
      section.href === "/arena"
        ? "Arena | Rumbledore"
        : `${section.label} | Rumbledore Arena`,
  });
}
