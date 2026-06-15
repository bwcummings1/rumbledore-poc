import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireLeagueRole } from "@/auth/guards";
import { getDb } from "@/db";
import { getLoreStewardReviewData } from "@/lore/member-experience";
import { markLeagueOpened } from "@/navigation/league-switcher-data";
import {
  type LeagueDeepLinkSearchParams,
  redirectToLeagueDeepLinkOnboarding,
} from "../../league-deep-link-routing";
import { LeagueSectionAccessState } from "../../league-section-access-state";
import { LoreStewardReviewView } from "./lore-steward-review-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Lore Steward Review | Rumbledore",
  description: "Review and adjudicate open league lore votes.",
};

interface LoreStewardReviewPageProps {
  params: Promise<{ leagueId: string }>;
  searchParams?: Promise<LeagueDeepLinkSearchParams>;
}

export default async function LoreStewardReviewPage({
  params,
  searchParams,
}: LoreStewardReviewPageProps) {
  const { leagueId } = await params;
  const query = await searchParams;
  const db = getDb();
  const access = await requireLeagueRole({
    db,
    headers: await headers(),
    leagueId,
    minRole: "data_steward",
  });

  if (!access.ok) {
    if (access.error.code === "INVALID_LEAGUE_ID") {
      notFound();
    }
    if (access.error.status === 401) {
      redirectToLeagueDeepLinkOnboarding({
        leagueId,
        searchParams: query,
        segments: ["lore", "steward"],
      });
    }
    return (
      <LeagueSectionAccessState
        title="No lore steward access"
        body="This page is available to league data stewards and commissioners."
      />
    );
  }

  await markLeagueOpened(db, { leagueId, userId: access.value.userId });

  const result = await getLoreStewardReviewData(db, { leagueId });
  switch (result.status) {
    case "ready":
      return <LoreStewardReviewView data={result.data} />;
    case "not_found":
      notFound();
  }
}
