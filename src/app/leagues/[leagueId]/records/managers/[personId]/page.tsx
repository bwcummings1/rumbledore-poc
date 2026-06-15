import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireLeagueRole } from "@/auth/guards";
import { getDb } from "@/db";
import { markLeagueOpened } from "@/navigation/league-switcher-data";
import { LeagueSectionAccessState } from "../../../league-section-access-state";
import { ManagerRecordsView } from "../../manager-records-view";
import { getManagerRecordsPageData } from "../../records-page-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Manager Records | Rumbledore",
  description: "Manager history and head-to-head records for this league.",
};

interface ManagerRecordsPageProps {
  params: Promise<{ leagueId: string; personId: string }>;
}

export default async function ManagerRecordsPage({
  params,
}: ManagerRecordsPageProps) {
  const { leagueId, personId } = await params;
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
          body="Connect a provider or sign in before opening manager records."
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

  const result = await getManagerRecordsPageData(db, { leagueId, personId });
  switch (result.status) {
    case "ready":
      return <ManagerRecordsView data={result.data} />;
    case "not_found":
      notFound();
  }
}
