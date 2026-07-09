import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import { getDb } from "@/db";
import { getLeaguePressArticleShareMetadata } from "@/news";
import { leagueArticleMetadata } from "@/share/route-metadata";
import { legacyLeaguePostRedirectHref } from "../../legacy-route-redirects";

export const dynamic = "force-dynamic";

interface LeagueBlogPostPageProps {
  params: Promise<{ leagueId: string; postId: string }>;
}

export async function generateMetadata({
  params,
}: LeagueBlogPostPageProps): Promise<Metadata> {
  const { leagueId, postId } = await params;
  const result = await getLeaguePressArticleShareMetadata(getDb(), {
    leagueId,
    postId,
  });
  return result.status === "ready"
    ? leagueArticleMetadata(
        result.data,
        legacyLeaguePostRedirectHref(leagueId, postId),
      )
    : {
        title: "Press Article | Rumbledore",
        description: "A league-scoped column from the Rumbledore cast.",
      };
}

export default async function LeagueBlogPostPage({
  params,
}: LeagueBlogPostPageProps) {
  const { leagueId, postId } = await params;
  permanentRedirect(legacyLeaguePostRedirectHref(leagueId, postId));
}
