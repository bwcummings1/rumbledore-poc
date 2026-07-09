import type { Metadata } from "next";
import { headers } from "next/headers";
import { requireSession } from "@/auth/guards";
import { getDb } from "@/db";
import { getCentralNewsHubData } from "@/news/hub";
import { centralNewsFrontMetadata } from "@/share/route-metadata";
import { NewsHubView } from "./news-hub-view";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return centralNewsFrontMetadata();
}

interface NewsPageProps {
  searchParams?: Promise<{
    leagueId?: string | string[];
    tag?: string | string[];
  }>;
}

function firstSearchValue(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export default async function NewsPage({ searchParams }: NewsPageProps) {
  const params = await searchParams;
  const tag = firstSearchValue(params?.tag);
  const forLeagueId = firstSearchValue(params?.leagueId);
  const session = await requireSession({ headers: await headers() });
  const data = await getCentralNewsHubData(getDb(), {
    forLeagueId,
    tag,
    userId: session.ok ? session.value.userId : null,
  });
  return <NewsHubView data={data} />;
}
