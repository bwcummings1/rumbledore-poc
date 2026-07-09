import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicationArticleView } from "@/components/publication/article-view";
import { getDb } from "@/db";
import {
  getCentralNewsArticleData,
  getCentralNewsArticleShareMetadata,
} from "@/news";
import {
  centralNewsArticleMetadata,
  centralNewsFrontMetadata,
} from "@/share/route-metadata";

export const dynamic = "force-dynamic";

interface NewsArticlePageProps {
  params: Promise<{ articleId: string }>;
}

export async function generateMetadata({
  params,
}: NewsArticlePageProps): Promise<Metadata> {
  const { articleId } = await params;
  const result = await getCentralNewsArticleShareMetadata(getDb(), {
    articleId,
  });
  return result.status === "ready"
    ? centralNewsArticleMetadata(result.data)
    : centralNewsFrontMetadata();
}

export default async function NewsArticlePage({
  params,
}: NewsArticlePageProps) {
  const { articleId } = await params;
  const result = await getCentralNewsArticleData(getDb(), { articleId });

  switch (result.status) {
    case "ready":
      return <PublicationArticleView data={result.data} />;
    case "not_found":
      notFound();
  }
}
