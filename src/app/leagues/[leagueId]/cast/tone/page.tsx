import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getLeagueToneProfileEditorData } from "@/ai";
import { isValidLeagueId, requirePlatformAdmin } from "@/auth/guards";
import { getDb } from "@/db";
import { markLeagueOpened } from "@/navigation/league-switcher-data";
import {
  type LeagueDeepLinkSearchParams,
  redirectToLeagueDeepLinkOnboarding,
} from "../../league-deep-link-routing";
import { LeagueSectionAccessState } from "../../league-section-access-state";
import { PersonaToneEditorView } from "./persona-tone-editor-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tone Editor | Rumbledore",
  description: "Versioned tone profiles for the league AI cast.",
};

interface LeagueCastTonePageProps {
  params: Promise<{ leagueId: string }>;
  searchParams?: Promise<LeagueDeepLinkSearchParams>;
}

export default async function LeagueCastTonePage({
  params,
  searchParams,
}: LeagueCastTonePageProps) {
  const { leagueId } = await params;
  const query = await searchParams;
  const db = getDb();
  const access = await requirePlatformAdmin({
    db,
    headers: await headers(),
  });

  if (!access.ok) {
    if (access.error.status === 401) {
      redirectToLeagueDeepLinkOnboarding({
        leagueId,
        searchParams: query,
        segments: ["cast", "tone"],
      });
    }
    return (
      <LeagueSectionAccessState
        title="Platform administrator access required"
        body="Persona tone is centrally curated and is not configurable per league."
      />
    );
  }
  if (!isValidLeagueId(leagueId)) {
    notFound();
  }

  await markLeagueOpened(db, { leagueId, userId: access.value.userId });

  const result = await getLeagueToneProfileEditorData(db, { leagueId });
  if (result.status === "not_found") {
    notFound();
  }

  return <PersonaToneEditorView data={result.data} />;
}
