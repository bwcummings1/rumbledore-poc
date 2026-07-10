import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getAiUsageRollupData } from "@/ai";
import { requireLeagueRole } from "@/auth/guards";
import { getDb } from "@/db";
import { markLeagueOpened } from "@/navigation/league-switcher-data";
import {
  type LeagueDeepLinkSearchParams,
  redirectToLeagueDeepLinkOnboarding,
} from "../../league-deep-link-routing";
import { LeagueSectionAccessState } from "../../league-section-access-state";
import { AiUsageRollupView } from "./ai-usage-rollup-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "AI Usage | Rumbledore",
  description: "Per-league AI generation usage and mock-cost attribution.",
};

interface AiUsagePageProps {
  params: Promise<{ leagueId: string }>;
  searchParams?: Promise<LeagueDeepLinkSearchParams>;
}

export default async function AiUsagePage({
  params,
  searchParams,
}: AiUsagePageProps) {
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
        segments: ["press", "usage"],
      });
    }
    return (
      <LeagueSectionAccessState
        title="No AI usage access"
        body="This page is available to league commissioners and data stewards."
      />
    );
  }

  await markLeagueOpened(db, { leagueId, userId: access.value.userId });

  const result = await getAiUsageRollupData(db, { leagueId });
  switch (result.status) {
    case "ready":
      return <AiUsageRollupView data={result.data} />;
    case "not_found":
      notFound();
  }
}
