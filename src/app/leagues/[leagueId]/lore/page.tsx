import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireLeagueRole } from "@/auth/guards";
import { getDb } from "@/db";
import { getLoreSectionData } from "@/lore/member-experience";
import { markLeagueOpened } from "@/navigation/league-switcher-data";
import {
  type LeagueDeepLinkSearchParams,
  redirectToLeagueDeepLinkOnboarding,
} from "../league-deep-link-routing";
import { LeagueSectionAccessState } from "../league-section-access-state";
import { LeagueLoreView } from "./league-lore-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Lore | Rumbledore",
  description: "The league's member-authored mythology and canon.",
};

interface LeagueLorePageProps {
  params: Promise<{ leagueId: string }>;
  searchParams?: Promise<LeagueDeepLinkSearchParams>;
}

function firstSearchValue(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export default async function LeagueLorePage({
  params,
  searchParams,
}: LeagueLorePageProps) {
  const { leagueId } = await params;
  const query = await searchParams;
  const activeSubject = firstSearchValue(query?.subject);
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
        segments: ["lore"],
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

  const result = await getLoreSectionData(db, {
    leagueId,
    subject: activeSubject,
  });

  switch (result.status) {
    case "ready":
      return <LeagueLoreView data={result.data} />;
    case "not_found":
      notFound();
  }
}
