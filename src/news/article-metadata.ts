const TAG_KEYS = ["tags", "topics"] as const;
const DEK_KEYS = ["dek", "standfirst", "subtitle", "description"] as const;
const HERO_KEYS = [
  "heroImageUrl",
  "heroImage",
  "imageUrl",
  "thumbnailUrl",
] as const;
const LORE_CITATION_KEYS = [
  "canonCitations",
  "citedCanonClaimIds",
  "loreCitations",
  "loreClaimIds",
] as const;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function normalizeTag(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function stringArrayValue(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const text = cleanText(item);
    return text ? [text] : [];
  });
}

function loreClaimIdValue(value: unknown): string | null {
  if (typeof value === "string") {
    const text = value.trim();
    return UUID_RE.test(text) ? text : null;
  }

  const record = asRecord(value);
  for (const key of ["claimId", "id", "loreClaimId"] as const) {
    const text = cleanText(record[key]);
    if (UUID_RE.test(text)) {
      return text;
    }
  }

  return null;
}

function loreClaimIdsValue(value: unknown): string[] {
  if (!Array.isArray(value)) {
    const id = loreClaimIdValue(value);
    return id ? [id] : [];
  }

  return value.flatMap((item) => {
    const id = loreClaimIdValue(item);
    return id ? [id] : [];
  });
}

function firstMetadataText(metadata: unknown, keys: readonly string[]): string {
  const record = asRecord(metadata);
  for (const key of keys) {
    const value = cleanText(record[key]);
    if (value) {
      return value;
    }
  }
  return "";
}

export function articleDek(metadata: unknown, fallbackSummary: string): string {
  return firstMetadataText(metadata, DEK_KEYS) || cleanText(fallbackSummary);
}

export function articleHeroImageUrl(metadata: unknown): string {
  const value = firstMetadataText(metadata, HERO_KEYS);
  if (!value) {
    return "";
  }
  if (value.startsWith("/") || value.startsWith("https://")) {
    return value;
  }
  if (value.startsWith("http://")) {
    return value;
  }
  return "";
}

export function articleTags(metadata: unknown): string[] {
  const record = asRecord(metadata);
  const seen = new Set<string>();
  const tags: string[] = [];

  for (const key of TAG_KEYS) {
    for (const value of stringArrayValue(record[key])) {
      const normalized = normalizeArticleTag(value);
      if (!normalized || seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      tags.push(value);
    }
  }

  return tags;
}

export function articleLoreCitationIds(metadata: unknown): string[] {
  const record = asRecord(metadata);
  const ids: string[] = [];
  const seen = new Set<string>();

  function add(values: readonly string[]) {
    for (const id of values) {
      if (seen.has(id)) {
        continue;
      }
      seen.add(id);
      ids.push(id);
    }
  }

  for (const key of LORE_CITATION_KEYS) {
    add(loreClaimIdsValue(record[key]));
  }

  const trigger = asRecord(record.trigger);
  add(loreClaimIdsValue(trigger.loreClaim));
  add(loreClaimIdsValue(trigger.loreClaimId));

  return ids;
}

export function normalizeArticleTag(value: string | null | undefined): string {
  return normalizeTag(value ?? "");
}

export function articleHasTag(
  tags: readonly string[] | undefined,
  tag: string | null | undefined,
): boolean {
  const normalized = normalizeArticleTag(tag);
  if (!normalized) {
    return true;
  }
  return (tags ?? []).some(
    (candidate) => normalizeArticleTag(candidate) === normalized,
  );
}

export function sharedArticleTagCount(
  left: readonly string[],
  right: readonly string[],
): number {
  if (left.length === 0 || right.length === 0) {
    return 0;
  }

  const normalizedRight = new Set(right.map(normalizeArticleTag));
  return left.reduce(
    (count, tag) =>
      count + (normalizedRight.has(normalizeArticleTag(tag)) ? 1 : 0),
    0,
  );
}
