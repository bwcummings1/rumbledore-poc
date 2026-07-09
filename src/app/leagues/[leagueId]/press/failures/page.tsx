import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getGenerationFailureQueueData } from "@/ai";
import { requireLeagueRole } from "@/auth/guards";
import { getDb } from "@/db";
import { markLeagueOpened } from "@/navigation/league-switcher-data";
import {
  type LeagueDeepLinkSearchParams,
  redirectToLeagueDeepLinkOnboarding,
} from "../../league-deep-link-routing";
import { LeagueSectionAccessState } from "../../league-section-access-state";
import { GenerationFailureQueueView } from "./generation-failure-queue-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "AI Failure Queue | Rumbledore",
  description: "Review skipped, failed, and stale AI generation runs.",
};

interface GenerationFailureQueuePageProps {
  params: Promise<{ leagueId: string }>;
  searchParams?: Promise<LeagueDeepLinkSearchParams>;
}

export default async function GenerationFailureQueuePage({
  params,
  searchParams,
}: GenerationFailureQueuePageProps) {
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
        segments: ["press", "failures"],
      });
    }
    return (
      <LeagueSectionAccessState
        title="No editorial queue access"
        body="This page is available to league commissioners and data stewards."
      />
    );
  }

  await markLeagueOpened(db, { leagueId, userId: access.value.userId });

  const result = await getGenerationFailureQueueData(db, { leagueId });
  switch (result.status) {
    case "ready":
      return <GenerationFailureQueueView data={result.data} />;
    case "not_found":
      notFound();
  }
}
