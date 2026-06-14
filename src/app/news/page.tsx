import type { Metadata } from "next";
import { getDb } from "@/db";
import { getCentralNewsHubData } from "@/news/hub";
import { NewsHubView } from "./news-hub-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Central News | Rumbledore",
  description: "League-agnostic NFL and fantasy-football headlines.",
};

interface NewsPageProps {
  searchParams?: Promise<{ tag?: string | string[] }>;
}

function firstSearchValue(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export default async function NewsPage({ searchParams }: NewsPageProps) {
  const tag = firstSearchValue((await searchParams)?.tag);
  const data = await getCentralNewsHubData(getDb(), { tag });
  return <NewsHubView data={data} />;
}
