import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireLeagueRole } from "@/auth/guards";
import { getDb } from "@/db";
import { getLoreMemberIdForUser, isLoreSteward } from "@/lore/member-auth";
import { getLoreClaimDetailData } from "@/lore/member-experience";
import { markLeagueOpened } from "@/navigation/league-switcher-data";
import { LeagueSectionAccessState } from "../../league-section-access-state";
import { LeagueLoreClaimView } from "./league-lore-claim-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Lore Claim | Rumbledore",
  description: "Vote on a league lore claim.",
};

interface LeagueLoreClaimPageProps {
  params: Promise<{ claimId: string; leagueId: string }>;
}

export default async function LeagueLoreClaimPage({
  params,
}: LeagueLoreClaimPageProps) {
  const { claimId, leagueId } = await params;
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
          body="Sign in before opening league lore."
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

  const memberId = await getLoreMemberIdForUser(db, {
    leagueId,
    userId: access.value.userId,
  });
  const result = await getLoreClaimDetailData(db, {
    claimId,
    isSteward: isLoreSteward(access.value),
    leagueId,
    memberId,
  });

  switch (result.status) {
    case "ready":
      return <LeagueLoreClaimView data={result.data} />;
    case "not_found":
      notFound();
  }
}
