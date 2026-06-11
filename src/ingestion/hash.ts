import { createHash } from "node:crypto";

type Jsonish =
  | boolean
  | null
  | number
  | string
  | Jsonish[]
  | { [key: string]: Jsonish };

const OMIT = Symbol("omit");

function canonicalize(value: unknown): Jsonish | typeof OMIT {
  if (value === undefined) {
    return OMIT;
  }
  if (value === null) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map((entry) => {
      const canonical = canonicalize(entry);
      return canonical === OMIT ? null : canonical;
    });
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, entry]) => [key, canonicalize(entry)] as const)
        .filter(
          (entry): entry is readonly [string, Jsonish] => entry[1] !== OMIT,
        )
        .sort(([left], [right]) => left.localeCompare(right)),
    );
  }
  if (
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return value;
  }

  return String(value);
}

export function stableJson(value: unknown): string {
  const canonical = canonicalize(value);
  return JSON.stringify(canonical === OMIT ? null : canonical);
}

export function stableContentHash(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}
