import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getArenaLeaderboardData } from "@/betting";
import { getDb } from "@/db";
import {
  ARENA_NAVIGATION_SECTIONS,
  type ArenaSectionId,
} from "@/navigation/scope";
import { ArenaLeaderboardView } from "../arena-leaderboard-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Arena Section | Rumbledore",
  description: "A section of the central cross-league Arena.",
};

interface ArenaSectionPageProps {
  params: Promise<{ section: string }>;
  searchParams?: Promise<{
    leagueId?: string | string[];
    rivalLeagueId?: string | string[];
    season?: string | string[];
    seasonId?: string | string[];
  }>;
}

function firstSearchValue(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

function arenaSectionBySlug(slug: string): ArenaSectionId | null {
  const section = ARENA_NAVIGATION_SECTIONS.find((candidate) => {
    if (candidate.id === "leaderboard") {
      return false;
    }
    return candidate.href === `/arena/${slug}`;
  });

  return section?.id ?? null;
}

export default async function ArenaSectionPage({
  params,
  searchParams,
}: ArenaSectionPageProps) {
  const { section: sectionSlug } = await params;
  const sectionId = arenaSectionBySlug(sectionSlug);
  if (!sectionId) {
    notFound();
  }

  const query = await searchParams;
  const data = await getArenaLeaderboardData(getDb(), {
    leagueId: firstSearchValue(query?.leagueId) ?? undefined,
    rivalLeagueId: firstSearchValue(query?.rivalLeagueId) ?? undefined,
    seasonId:
      firstSearchValue(query?.seasonId) ??
      firstSearchValue(query?.season) ??
      undefined,
  });

  return <ArenaLeaderboardView data={data} sectionId={sectionId} />;
}
