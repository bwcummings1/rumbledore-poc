import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireLeagueRole } from "@/auth/guards";
import { getDb } from "@/db";
import { getLeagueHomeData } from "@/home/league-home";
import { markLeagueOpened } from "@/navigation/league-switcher-data";
import { LeagueSectionAccessState } from "../league-section-access-state";
import { LeagueRecordsView } from "./league-records-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Records | Rumbledore",
  description: "All-time and season records for this league.",
};

interface LeagueRecordsPageProps {
  params: Promise<{ leagueId: string }>;
}

export default async function LeagueRecordsPage({
  params,
}: LeagueRecordsPageProps) {
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
          body="Connect a provider or sign in before opening league records."
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

  const result = await getLeagueHomeData(db, {
    leagueId,
    userId: access.value.userId,
    userRole: access.value.role,
  });

  switch (result.status) {
    case "ready":
      return <LeagueRecordsView data={result.data} />;
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
