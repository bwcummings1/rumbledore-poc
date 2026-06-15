import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireLeagueRole } from "@/auth/guards";
import { getDb } from "@/db";
import { markLeagueOpened } from "@/navigation/league-switcher-data";
import { getLeagueInviteDependencies } from "@/onboarding/deps";
import { listLeaguemateInviteTargets } from "@/onboarding/invites";
import { listDataStewardDoorway } from "@/onboarding/stewards";
import { LeagueInviteView } from "../invite/league-invite-view";
import {
  type LeagueDeepLinkSearchParams,
  redirectToLeagueDeepLinkOnboarding,
} from "../league-deep-link-routing";
import { LeagueSectionAccessState } from "../league-section-access-state";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Members | Rumbledore",
  description: "League members, invite links, and settings.",
};

interface LeagueMembersPageProps {
  params: Promise<{ leagueId: string }>;
  searchParams?: Promise<LeagueDeepLinkSearchParams>;
}

export default async function LeagueMembersPage({
  params,
  searchParams,
}: LeagueMembersPageProps) {
  const { leagueId } = await params;
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
        segments: ["members"],
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

  const result = await listLeaguemateInviteTargets(
    getLeagueInviteDependencies(),
    {
      leagueId,
      userId: access.value.userId,
      userRole: access.value.role,
    },
  );

  if (!result.ok) {
    if (result.error.status === 404) {
      notFound();
    }
    return (
      <LeagueSectionAccessState
        title="Members unavailable"
        body={result.error.message}
      />
    );
  }

  const stewardDoorway = await listDataStewardDoorway(db, {
    leagueId,
    userId: access.value.userId,
    userRole: access.value.role,
  });
  if (!stewardDoorway.ok) {
    return (
      <LeagueSectionAccessState
        title="Members unavailable"
        body={stewardDoorway.error.message}
      />
    );
  }

  return (
    <LeagueInviteView
      initialSummary={result.value}
      stewardDoorway={stewardDoorway.value}
    />
  );
}
