const LOCAL_URL_BASE = "https://rumbledore.local";

export const RETURN_TO_PARAM = "returnTo";
export const YAHOO_OAUTH_RETURN_TO_COOKIE = "rumbledore_yahoo_return_to";

type SearchParamValue = string | string[] | undefined;

function hasControlChars(value: string) {
  for (const char of value) {
    const codePoint = char.codePointAt(0);
    if (codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f)) {
      return true;
    }
  }
  return false;
}

function decodeEncodedLocalPath(value: string) {
  if (!value.toLowerCase().startsWith("%2f")) {
    return value;
  }

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function normalizeLocalReturnTo(value: string | null | undefined) {
  const candidate = decodeEncodedLocalPath(value?.trim() ?? "");
  if (!candidate) {
    return null;
  }

  if (
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\") ||
    hasControlChars(candidate)
  ) {
    return null;
  }

  try {
    const url = new URL(candidate, LOCAL_URL_BASE);
    if (url.origin !== LOCAL_URL_BASE) {
      return null;
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export function returnToFromSearchParams(
  searchParams: Record<string, SearchParamValue> | null | undefined,
) {
  const value = searchParams?.[RETURN_TO_PARAM];
  const candidate = Array.isArray(value) ? value[0] : value;
  return normalizeLocalReturnTo(candidate);
}

export function withReturnTo(
  href: string,
  returnTo: string | null | undefined,
) {
  const normalized = normalizeLocalReturnTo(returnTo);
  if (!normalized) {
    return href;
  }

  const url = new URL(href, LOCAL_URL_BASE);
  if (url.origin !== LOCAL_URL_BASE) {
    return href;
  }

  url.searchParams.set(RETURN_TO_PARAM, normalized);
  return `${url.pathname}${url.search}${url.hash}`;
}
