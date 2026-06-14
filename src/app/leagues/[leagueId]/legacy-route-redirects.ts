import { getLeagueSectionHref } from "@/navigation";

export function legacyLeagueFeedRedirectHref(leagueId: string): string {
  return getLeagueSectionHref(leagueId, "press");
}

export function legacyLeagueInviteRedirectHref(leagueId: string): string {
  return getLeagueSectionHref(leagueId, "members");
}

export function legacyLeaguePostRedirectHref(
  leagueId: string,
  postId: string,
): string {
  return `${getLeagueSectionHref(leagueId, "press")}/${encodeURIComponent(postId)}`;
}
