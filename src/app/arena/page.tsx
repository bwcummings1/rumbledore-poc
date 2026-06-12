import type { Metadata } from "next";
import { getArenaLeaderboardData } from "@/betting";
import { getDb } from "@/db";
import { ArenaLeaderboardView } from "./arena-leaderboard-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Arena | Rumbledore",
  description: "Cross-league paper-betting leaderboards.",
};

export default async function ArenaPage() {
  const data = await getArenaLeaderboardData(getDb());
  return <ArenaLeaderboardView data={data} />;
}
