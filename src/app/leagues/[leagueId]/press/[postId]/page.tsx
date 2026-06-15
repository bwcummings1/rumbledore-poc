import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireLeagueRole } from "@/auth/guards";
import { getDb } from "@/db";
import { markLeagueOpened } from "@/navigation/league-switcher-data";
import { getLeagueFeedData, getLeaguePressArticleData } from "@/news";
import { getLeaguePublicationSectionBySlug } from "@/news/sections";
import { LeagueFeedView } from "../../feed/league-feed-view";
import {
  type LeagueDeepLinkSearchParams,
  redirectToLeagueDeepLinkOnboarding,
} from "../../league-deep-link-routing";
import { LeagueSectionAccessState } from "../../league-section-access-state";
import { LeagueBlogPostView } from "../../posts/[postId]/league-blog-post-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Press Article | Rumbledore",
  description: "A league-scoped column from the Rumbledore cast.",
};

interface LeaguePressPostPageProps {
  params: Promise<{ leagueId: string; postId: string }>;
  searchParams?: Promise<LeagueDeepLinkSearchParams>;
}

function firstSearchValue(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export default async function LeaguePressPostPage({
  params,
  searchParams,
}: LeaguePressPostPageProps) {
  const { leagueId, postId } = await params;
  const query = await searchParams;
  const activeTag = firstSearchValue(query?.tag);
  const db = getDb();
  const access = await requireLeagueRole({
    db,
    headers: await headers(),
    leagueId,
    minRole: "member",
  });

  if (!access.ok) {
    if (access.error.code === "INVALID_LEAGUE_ID") {
      notFound();
    }
    if (access.error.status === 401) {
      redirectToLeagueDeepLinkOnboarding({
        leagueId,
        searchParams: query,
        segments: ["press", postId],
      });
    }
    return (
      <LeagueSectionAccessState
        title="No league access"
        body="This account is not a member of that league."
      />
    );
  }

  await markLeagueOpened(db, { leagueId, userId: access.value.userId });

  const section = getLeaguePublicationSectionBySlug(postId);
  if (section) {
    const sectionResult = await getLeagueFeedData(db, {
      leagueId,
      sectionId: section.id,
      tag: activeTag,
      userId: access.value.userId,
      userRole: access.value.role,
    });

    switch (sectionResult.status) {
      case "ready":
        return <LeagueFeedView data={sectionResult.data} />;
      case "forbidden":
        return (
          <LeagueSectionAccessState
            title="No league access"
            body="This account is not a member of that league."
          />
        );
      case "not_found":
        notFound();
    }
  }

  const result = await getLeaguePressArticleData(db, {
    leagueId,
    postId,
    userId: access.value.userId,
    userRole: access.value.role,
  });

  switch (result.status) {
    case "ready":
      return <LeagueBlogPostView data={result.data} />;
    case "forbidden":
      return (
        <LeagueSectionAccessState
          title="No league access"
          body="This account is not a member of that league."
        />
      );
    case "not_found":
      notFound();
  }
}
