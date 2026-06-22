import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireLeagueRole } from "@/auth/guards";
import { getDb } from "@/db";
import { markLeagueOpened } from "@/navigation/league-switcher-data";
import {
  type LeagueDeepLinkSearchParams,
  redirectToLeagueDeepLinkOnboarding,
} from "../league-deep-link-routing";
import { LeagueSectionAccessState } from "../league-section-access-state";
import { getEditLedgerPageData } from "./edit-ledger-data";
import { EditLedgerView } from "./edit-ledger-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Edit Ledger | Rumbledore",
  description: "Read-only league curation change log.",
};

interface LeagueEditLedgerPageProps {
  params: Promise<{ leagueId: string }>;
  searchParams?: Promise<LeagueDeepLinkSearchParams>;
}

export default async function LeagueEditLedgerPage({
  params,
  searchParams,
}: LeagueEditLedgerPageProps) {
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
        segments: ["ledger"],
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

  const result = await getEditLedgerPageData(db, { leagueId });

  switch (result.status) {
    case "ready":
      return <EditLedgerView data={result.data} />;
    case "not_found":
      notFound();
  }
}
