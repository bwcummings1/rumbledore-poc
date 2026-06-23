import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { type LeagueRole, requireLeagueRole } from "@/auth/guards";
import { getDb } from "@/db";
import { markLeagueOpened } from "@/navigation/league-switcher-data";
import {
  type LeagueDeepLinkSearchParams,
  redirectToLeagueDeepLinkOnboarding,
} from "../league-deep-link-routing";
import { LeagueSectionAccessState } from "../league-section-access-state";
import { getLeagueDataBookData } from "./data-book-data";
import { DataBookView } from "./data-book-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Data Book | Rumbledore",
  description: "League data substrate tables by season.",
};

interface LeagueDataBookPageProps {
  params: Promise<{ leagueId: string }>;
  searchParams?: Promise<LeagueDeepLinkSearchParams>;
}

function canEditDataBook(role: LeagueRole): boolean {
  switch (role) {
    case "commissioner":
    case "data_steward":
    case "league_admin":
      return true;
    case "member":
      return false;
  }
}

export default async function LeagueDataBookPage({
  params,
  searchParams,
}: LeagueDataBookPageProps) {
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
        segments: ["data"],
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

  const canEditData = canEditDataBook(access.value.role);
  const result = await getLeagueDataBookData(db, {
    canManageEras: canEditData,
    leagueId,
  });

  switch (result.status) {
    case "ready":
      return <DataBookView canEditData={canEditData} data={result.data} />;
    case "not_found":
      notFound();
  }
}
