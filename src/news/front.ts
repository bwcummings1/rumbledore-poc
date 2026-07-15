const HOUR_MS = 60 * 60 * 1000;
const IMPORTANCE_BOOST_HOURS = 48;

// League importance is deliberately narrow: a lead holds over routine columns
// for the rest of an editorial week without permanently defeating freshness.
export const LEAGUE_EDITORIAL_IMPORTANCE_BASELINE = 1;
export const LEAGUE_EDITORIAL_IMPORTANCE_LEAD = 4;

export interface PublicationFront<T> {
  lead: T | null;
  secondaries: T[];
  river: T[];
}

export function normalizeEditorialImportance(
  value: unknown,
  fallback = 0,
): number {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseFloat(value)
        : fallback;

  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.min(Math.max(numeric, 0), 100);
}

export function editorialImportance(
  metadata: Record<string, unknown> | null | undefined,
): number {
  return normalizeEditorialImportance(
    metadata?.editorialImportance ?? metadata?.importance,
  );
}

export function publicationRankScore({
  editorialImportance: importance = 0,
  kindBoostHours = 0,
  publishedAt,
  relevanceScore = 0,
}: {
  editorialImportance?: number;
  kindBoostHours?: number;
  publishedAt: string;
  relevanceScore?: number;
}): number {
  return (
    Date.parse(publishedAt) / HOUR_MS +
    kindBoostHours +
    relevanceScore +
    importance * IMPORTANCE_BOOST_HOURS
  );
}

function defaultSecondaryCount(total: number): number {
  const remaining = total - 1;
  if (remaining <= 0) {
    return 0;
  }
  if (remaining === 1) {
    return 1;
  }
  return Math.min(3, remaining);
}

export function buildPublicationFront<T>(
  items: readonly T[],
  input: { secondaryCount?: number } = {},
): PublicationFront<T> {
  const [lead = null] = items;
  const secondaryCount = Math.min(
    Math.max(input.secondaryCount ?? defaultSecondaryCount(items.length), 0),
    4,
    Math.max(items.length - 1, 0),
  );

  return {
    lead,
    river: items.slice(1 + secondaryCount),
    secondaries: items.slice(1, 1 + secondaryCount),
  };
}
