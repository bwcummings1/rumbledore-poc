const HOUR_MS = 60 * 60 * 1000;
const IMPORTANCE_BOOST_HOURS = 48;

export interface PublicationFront<T> {
  lead: T | null;
  secondaries: T[];
  river: T[];
}

export function editorialImportance(
  metadata: Record<string, unknown> | null | undefined,
): number {
  const value = metadata?.editorialImportance ?? metadata?.importance;
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseFloat(value)
        : 0;

  if (!Number.isFinite(numeric)) {
    return 0;
  }

  return Math.min(Math.max(numeric, 0), 100);
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
