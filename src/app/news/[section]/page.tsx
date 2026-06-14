import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireSession } from "@/auth/guards";
import { getDb } from "@/db";
import { getCentralNewsHubData } from "@/news/hub";
import { getCentralPublicationSectionBySlug } from "@/news/sections";
import { NewsHubView } from "../news-hub-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "News Section | Rumbledore",
  description: "A section front from Rumbledore News.",
};

interface NewsSectionPageProps {
  params: Promise<{ section: string }>;
  searchParams?: Promise<{
    leagueId?: string | string[];
    tag?: string | string[];
  }>;
}

function firstSearchValue(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export default async function NewsSectionPage({
  params,
  searchParams,
}: NewsSectionPageProps) {
  const { section: sectionSlug } = await params;
  const query = await searchParams;
  const tag = firstSearchValue(query?.tag);
  const forLeagueId = firstSearchValue(query?.leagueId);
  const section = getCentralPublicationSectionBySlug(sectionSlug);
  if (!section) {
    notFound();
  }

  const session = await requireSession({ headers: await headers() });
  const data = await getCentralNewsHubData(getDb(), {
    forLeagueId,
    sectionId: section.id,
    tag,
    userId: session.ok ? session.value.userId : null,
  });
  return <NewsHubView data={data} />;
}
