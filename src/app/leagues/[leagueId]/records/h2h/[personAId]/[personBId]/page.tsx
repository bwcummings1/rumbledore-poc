import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { requireLeagueRole } from "@/auth/guards";
import { getDb } from "@/db";
import { markLeagueOpened } from "@/navigation/league-switcher-data";
import {
  type LeagueDeepLinkSearchParams,
  redirectToLeagueDeepLinkOnboarding,
} from "../../../../league-deep-link-routing";
import { LeagueSectionAccessState } from "../../../../league-section-access-state";
import { HeadToHeadRecordsView } from "../../../h2h-records-view";
import {
  canonicalizeHeadToHeadPersonIds,
  getHeadToHeadRecordsPageData,
} from "../../../records-page-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Head-to-Head Records | Rumbledore",
  description: "Rivalry ledger and matchup history for this league.",
};

interface HeadToHeadRecordsPageProps {
  params: Promise<{
    leagueId: string;
    personAId: string;
    personBId: string;
  }>;
  searchParams?: Promise<LeagueDeepLinkSearchParams>;
}

export default async function HeadToHeadRecordsPage({
  params,
  searchParams,
}: HeadToHeadRecordsPageProps) {
  const { leagueId, personAId, personBId } = await params;
  const query = await searchParams;
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
        segments: ["records", "h2h", personAId, personBId],
      });
    }
    return (
      <LeagueSectionAccessState
        title="No league access"
        body="This account is not a member of that league."
      />
    );
  }

  if (personAId === personBId) {
    notFound();
  }

  const [canonicalPersonAId, canonicalPersonBId] =
    canonicalizeHeadToHeadPersonIds(personAId, personBId);
  if (canonicalPersonAId !== personAId || canonicalPersonBId !== personBId) {
    redirect(
      `/leagues/${leagueId}/records/h2h/${canonicalPersonAId}/${canonicalPersonBId}`,
    );
  }

  await markLeagueOpened(db, { leagueId, userId: access.value.userId });

  const result = await getHeadToHeadRecordsPageData(db, {
    leagueId,
    personAId: canonicalPersonAId,
    personBId: canonicalPersonBId,
  });
  switch (result.status) {
    case "ready":
      return <HeadToHeadRecordsView data={result.data} />;
    case "not_found":
      notFound();
  }
}
