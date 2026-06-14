import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicationArticleView } from "@/components/publication/article-view";
import { getDb } from "@/db";
import { getCentralNewsArticleData } from "@/news";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "News Article | Rumbledore",
  description: "A full article from Rumbledore News.",
};

interface NewsArticlePageProps {
  params: Promise<{ articleId: string }>;
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
