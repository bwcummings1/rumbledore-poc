import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireSession } from "@/auth/guards";
import { getDb } from "@/db";
import { getCentralNewsHubData } from "@/news/hub";
import { getCentralPublicationSectionBySlug } from "@/news/sections";
import {
  centralNewsFrontMetadata,
  centralNewsSectionMetadata,
} from "@/share/route-metadata";
import { NewsHubView } from "../news-hub-view";

export const dynamic = "force-dynamic";

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

export async function generateMetadata({
  params,
}: NewsSectionPageProps): Promise<Metadata> {
  const { section: sectionSlug } = await params;
  const section = getCentralPublicationSectionBySlug(sectionSlug);
  return section
    ? centralNewsSectionMetadata(section)
    : centralNewsFrontMetadata();
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
