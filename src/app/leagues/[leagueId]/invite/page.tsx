import { permanentRedirect } from "next/navigation";
import { legacyLeagueInviteRedirectHref } from "../legacy-route-redirects";

export const dynamic = "force-dynamic";

interface LeagueInvitePageProps {
  params: Promise<{ leagueId: string }>;
}

export default async function LeagueInvitePage({
  params,
}: LeagueInvitePageProps) {
  const { leagueId } = await params;
  permanentRedirect(legacyLeagueInviteRedirectHref(leagueId));
}
