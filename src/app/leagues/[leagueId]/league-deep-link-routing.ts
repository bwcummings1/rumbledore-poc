import { redirect } from "next/navigation";
import { withReturnTo } from "@/onboarding/return-to";

export type LeagueDeepLinkSearchParams = Record<
  string,
  string | string[] | undefined
>;

interface LeagueDeepLinkInput {
  leagueId: string;
  searchParams?: LeagueDeepLinkSearchParams | null;
  segments?: readonly string[];
}

function appendSearchParams(
  path: string,
  searchParams: LeagueDeepLinkSearchParams | null | undefined,
) {
  if (!searchParams) {
    return path;
  }

  const params = new URLSearchParams();
  for (const [key, rawValue] of Object.entries(searchParams)) {
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    for (const value of values) {
      if (value !== undefined) {
        params.append(key, value);
      }
    }
  }

  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export function leagueDeepLinkPath({
  leagueId,
  searchParams,
  segments = [],
}: LeagueDeepLinkInput) {
  const encodedPath = [leagueId, ...segments]
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return appendSearchParams(`/leagues/${encodedPath}`, searchParams);
}

export function leagueDeepLinkOnboardingHref(input: LeagueDeepLinkInput) {
  return withReturnTo("/onboarding/espn", leagueDeepLinkPath(input));
}

export function redirectToLeagueDeepLinkOnboarding(
  input: LeagueDeepLinkInput,
): never {
  redirect(leagueDeepLinkOnboardingHref(input));
}
