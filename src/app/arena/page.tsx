import type { Metadata } from "next";
import { getArenaLeaderboardData } from "@/betting";
import { getDb } from "@/db";
import { ARENA_NAVIGATION_SECTIONS } from "@/navigation/scope";
import { arenaShareMetadata } from "@/share/route-metadata";
import { ArenaLeaderboardView } from "./arena-leaderboard-view";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return arenaShareMetadata(ARENA_NAVIGATION_SECTIONS[0]);
}

interface ArenaPageProps {
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

export default async function ArenaPage({ searchParams }: ArenaPageProps) {
  const params = await searchParams;
  const data = await getArenaLeaderboardData(getDb(), {
    leagueId: firstSearchValue(params?.leagueId) ?? undefined,
    rivalLeagueId: firstSearchValue(params?.rivalLeagueId) ?? undefined,
    seasonId:
      firstSearchValue(params?.seasonId) ??
      firstSearchValue(params?.season) ??
      undefined,
  });
  return <ArenaLeaderboardView data={data} sectionId="leaderboard" />;
}
