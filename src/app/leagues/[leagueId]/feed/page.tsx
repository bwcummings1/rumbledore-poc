import { permanentRedirect } from "next/navigation";
import { legacyLeagueFeedRedirectHref } from "../legacy-route-redirects";

export const dynamic = "force-dynamic";

interface LeagueFeedPageProps {
  params: Promise<{ leagueId: string }>;
}

export default async function LeagueFeedPage({ params }: LeagueFeedPageProps) {
  const { leagueId } = await params;
  permanentRedirect(legacyLeagueFeedRedirectHref(leagueId));
}
