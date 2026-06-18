import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireLeagueRole } from "@/auth/guards";
import { getDb } from "@/db";
import { leagues } from "@/db/schema";
import { markLeagueOpened } from "@/navigation/league-switcher-data";
import { listDataStewardReview } from "@/stats";
import {
  type LeagueDeepLinkSearchParams,
  redirectToLeagueDeepLinkOnboarding,
} from "../../league-deep-link-routing";
import { LeagueSectionAccessState } from "../../league-section-access-state";
import {
  type DataCurationSummary,
  loadDataCurationSummary,
} from "./curation-data";
import { DataStewardReviewView } from "./data-steward-review-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Data Review | Rumbledore",
  description: "Review and clean league data integrity flags.",
};

interface DataStewardReviewPageProps {
  params: Promise<{ leagueId: string }>;
  searchParams?: Promise<LeagueDeepLinkSearchParams>;
}

export default async function DataStewardReviewPage({
  params,
  searchParams,
}: DataStewardReviewPageProps) {
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
        segments: ["members", "steward"],
      });
    }
    return (
      <LeagueSectionAccessState
        title="No data review access"
        body="This page is available to league members."
      />
    );
  }

  await markLeagueOpened(db, { leagueId, userId: access.value.userId });

  const [league] = await db
    .select({ id: leagues.id, name: leagues.name })
    .from(leagues)
    .where(eq(leagues.id, leagueId))
    .limit(1);
  if (!league) {
    notFound();
  }

  let curation: DataCurationSummary;
  try {
    curation = await loadDataCurationSummary(db, {
      leagueId,
      userRole: access.value.role,
    });
  } catch (error) {
    return (
      <LeagueSectionAccessState
        title="Data review unavailable"
        body={
          error instanceof Error
            ? error.message
            : "Data curation state could not be loaded."
        }
      />
    );
  }

  const review =
    access.value.role === "member"
      ? { integrityChecks: [], suggestedIdentityLinks: [] }
      : await listDataStewardReview(db, { leagueId });
  if ("ok" in review && !review.ok) {
    return (
      <LeagueSectionAccessState
        title="Data review unavailable"
        body={review.error.message}
      />
    );
  }

  return (
    <DataStewardReviewView
      curation={curation}
      initialSummary={"ok" in review ? review.value : review}
      league={league}
    />
  );
}
