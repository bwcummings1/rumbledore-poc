import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireSession } from "@/auth/guards";
import { PublicationArticleView } from "@/components/publication/article-view";
import { getDb } from "@/db";
import {
  getCentralNewsArticleData,
  getCentralNewsArticleShareMetadata,
} from "@/news";
import { withReturnTo } from "@/onboarding/return-to";
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
  switch (result.status) {
    case "ready":
      return centralNewsArticleMetadata(result.data);
    case "not_found":
      return centralNewsFrontMetadata();
  }
}

export default async function NewsArticlePage({
  params,
}: NewsArticlePageProps) {
  const { articleId } = await params;
  const result = await getCentralNewsArticleData(getDb(), { articleId });

  switch (result.status) {
    case "ready": {
      const session = await requireSession({ headers: await headers() });
      return (
        <PublicationArticleView
          data={
            session.ok
              ? result.data
              : {
                  ...result.data,
                  arrivalCta: {
                    body: "Connect a fantasy account and bring this desk into a league.",
                    href: withReturnTo(
                      "/onboarding/espn",
                      `/news/articles/${articleId}`,
                    ),
                    label: "Claim league",
                    title: "Reading as a guest",
                  },
                }
          }
        />
      );
    }
    case "not_found":
      notFound();
  }
}
