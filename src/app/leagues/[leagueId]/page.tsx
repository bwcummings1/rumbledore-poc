import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireLeagueRole } from "@/auth/guards";
import { getEnv } from "@/core/env";
import { getDb } from "@/db";
import { resolveEntitlement } from "@/entitlements";
import { getLeagueHomeData } from "@/home/league-home";
import { markLeagueOpened } from "@/navigation/league-switcher-data";
import {
  type LeagueDeepLinkSearchParams,
  redirectToLeagueDeepLinkOnboarding,
} from "./league-deep-link-routing";
import { LeagueHomeView } from "./league-home-view";
import { LeagueSectionAccessState } from "./league-section-access-state";

export const dynamic = "force-dynamic";

interface LeagueHomePageProps {
  params: Promise<{ leagueId: string }>;
  searchParams?: Promise<LeagueDeepLinkSearchParams>;
}

export default async function LeagueHomePage({
  params,
  searchParams,
}: LeagueHomePageProps) {
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
      redirectToLeagueDeepLinkOnboarding({ leagueId, searchParams: query });
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
      return (
        <LeagueHomeView
          castEntitlement={
            await resolveEntitlement({
              capability: "ai.cast.generate",
              db,
              env: { entitlements: getEnv().entitlements },
              leagueId,
            })
          }
          data={result.data}
        />
      );
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
