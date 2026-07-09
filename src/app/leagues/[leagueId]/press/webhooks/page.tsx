import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireLeagueRole } from "@/auth/guards";
import { getDb } from "@/db";
import { markLeagueOpened } from "@/navigation/league-switcher-data";
import { getLeagueWebhookManagerData } from "@/webhooks";
import {
  type LeagueDeepLinkSearchParams,
  redirectToLeagueDeepLinkOnboarding,
} from "../../league-deep-link-routing";
import { LeagueSectionAccessState } from "../../league-section-access-state";
import { LeagueWebhookManagerView } from "./webhook-manager-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Press Webhooks | Rumbledore",
  description: "Commissioner-managed group-chat delivery targets.",
};

interface LeagueWebhookManagerPageProps {
  params: Promise<{ leagueId: string }>;
  searchParams?: Promise<LeagueDeepLinkSearchParams>;
}

export default async function LeagueWebhookManagerPage({
  params,
  searchParams,
}: LeagueWebhookManagerPageProps) {
  const { leagueId } = await params;
  const query = await searchParams;
  const db = getDb();
  const access = await requireLeagueRole({
    db,
    headers: await headers(),
    leagueId,
    minRole: "commissioner",
  });

  if (!access.ok) {
    if (access.error.code === "INVALID_LEAGUE_ID") {
      notFound();
    }
    if (access.error.status === 401) {
      redirectToLeagueDeepLinkOnboarding({
        leagueId,
        searchParams: query,
        segments: ["press", "webhooks"],
      });
    }
    return (
      <LeagueSectionAccessState
        title="No webhook access"
        body="Group-chat delivery targets are managed by the league commissioner."
      />
    );
  }

  await markLeagueOpened(db, { leagueId, userId: access.value.userId });

  const data = await getLeagueWebhookManagerData(db, { leagueId });
  if (!data) {
    notFound();
  }

  return <LeagueWebhookManagerView data={data} />;
}
