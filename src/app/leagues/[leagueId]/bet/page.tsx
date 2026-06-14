import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireLeagueRole } from "@/auth/guards";
import { getLeagueBetData } from "@/betting";
import { getDb } from "@/db";
import { markLeagueOpened } from "@/navigation/league-switcher-data";
import { LeagueSectionAccessState } from "../league-section-access-state";
import { LeagueBetView } from "./league-bet-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Bet | Rumbledore",
  description: "League-scoped paper betting markets and bankroll.",
};

interface LeagueBetPageProps {
  params: Promise<{ leagueId: string }>;
}

export default async function LeagueBetPage({ params }: LeagueBetPageProps) {
  const { leagueId } = await params;
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
      return (
        <LeagueSectionAccessState
          title="Sign in required"
          body="Connect a provider or sign in before opening league betting."
        />
      );
    }
    return (
      <LeagueSectionAccessState
        title="No league access"
        body="This account is not a member of that league."
      />
    );
  }

  await markLeagueOpened(db, { leagueId, userId: access.value.userId });

  const result = await getLeagueBetData(db, {
    leagueId,
    userId: access.value.userId,
  });

  switch (result.status) {
    case "ready":
      return <LeagueBetView data={result.data} />;
    case "not_found":
      notFound();
  }
}
