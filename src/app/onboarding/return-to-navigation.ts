import { normalizeLocalReturnTo } from "@/onboarding/return-to";

function leagueIdFromReturnTo(returnTo: string) {
  const match = /^\/leagues\/([^/?#]+)/.exec(returnTo);
  const encodedLeagueId = match?.[1];
  if (!encodedLeagueId) {
    return null;
  }

  try {
    return decodeURIComponent(encodedLeagueId);
  } catch {
    return encodedLeagueId;
  }
}

export function returnToAfterConnection(returnTo: string | null | undefined) {
  const normalized = normalizeLocalReturnTo(returnTo);
  return normalized?.startsWith("/invite/") ? normalized : null;
}

export function returnToAfterImport(
  returnTo: string | null | undefined,
  importedLeagueIds: readonly string[],
) {
  const normalized = normalizeLocalReturnTo(returnTo);
  if (!normalized) {
    return null;
  }

  const leagueId = leagueIdFromReturnTo(normalized);
  if (leagueId && !importedLeagueIds.includes(leagueId)) {
    return null;
  }

  return normalized;
}

export function continueToReturnTo(returnTo: string | null | undefined) {
  if (!returnTo) {
    return false;
  }

  window.location.assign(returnTo);
  return true;
}
