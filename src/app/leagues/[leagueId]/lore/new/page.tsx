import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireLeagueRole } from "@/auth/guards";
import { getDb } from "@/db";
import { getLoreSectionData } from "@/lore/member-experience";
import { markLeagueOpened } from "@/navigation/league-switcher-data";
import { LeagueSectionAccessState } from "../../league-section-access-state";
import { LeagueLoreSubmitView } from "./league-lore-submit-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Submit Lore | Rumbledore",
  description: "Submit a league lore claim for vote or verification.",
};

interface LeagueLoreNewPageProps {
  params: Promise<{ leagueId: string }>;
}

export default async function LeagueLoreNewPage({
  params,
}: LeagueLoreNewPageProps) {
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
          body="Connect a provider or sign in before submitting league lore."
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

  const result = await getLoreSectionData(db, { leagueId });

  switch (result.status) {
    case "ready":
      return <LeagueLoreSubmitView data={result.data} />;
    case "not_found":
      notFound();
  }
}
