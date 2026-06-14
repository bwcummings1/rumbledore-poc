import type { Metadata } from "next";
import { notFound } from "next/navigation";
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
  searchParams?: Promise<{ tag?: string | string[] }>;
}

function firstSearchValue(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export default async function NewsSectionPage({
  params,
  searchParams,
}: NewsSectionPageProps) {
  const { section: sectionSlug } = await params;
  const tag = firstSearchValue((await searchParams)?.tag);
  const section = getCentralPublicationSectionBySlug(sectionSlug);
  if (!section) {
    notFound();
  }

  const data = await getCentralNewsHubData(getDb(), {
    sectionId: section.id,
    tag,
  });
  return <NewsHubView data={data} />;
}
