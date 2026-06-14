import { permanentRedirect } from "next/navigation";
import { legacyLeaguePostRedirectHref } from "../../legacy-route-redirects";

export const dynamic = "force-dynamic";

interface LeagueBlogPostPageProps {
  params: Promise<{ leagueId: string; postId: string }>;
}

export default async function LeagueBlogPostPage({
  params,
}: LeagueBlogPostPageProps) {
  const { leagueId, postId } = await params;
  permanentRedirect(legacyLeaguePostRedirectHref(leagueId, postId));
}
