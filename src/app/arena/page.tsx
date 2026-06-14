import type { Metadata } from "next";
import { getArenaLeaderboardData } from "@/betting";
import { getDb } from "@/db";
import { ArenaLeaderboardView } from "./arena-leaderboard-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Arena | Rumbledore",
  description: "Cross-league paper-betting leaderboards.",
};

interface ArenaPageProps {
  searchParams?: Promise<{
    leagueId?: string | string[];
    rivalLeagueId?: string | string[];
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
    seasonId: firstSearchValue(params?.seasonId) ?? undefined,
  });
  return <ArenaLeaderboardView data={data} />;
}
