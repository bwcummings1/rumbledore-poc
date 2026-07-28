// Some providers publish their vocabularies as strings (Sleeper's `"QB"`/`"BN"`,
// Yahoo's `display_position`/`selected_position`) while the shared integrity
// registry in ./decoding is numeric. This module is the one string→numeric bridge
// they share: stable, kind-scoped 31-bit ids, a collision-detecting numeric
// dictionary builder, and a negative-id sentinel for codes a provider emitted that
// its dictionary does not know. Raw strings remain the source of truth; the ids are
// only an adapter for provider_code_decoding and persisted metadata.
//
// Ids are namespaced by code kind, deliberately NOT by provider: dictionaries are
// looked up per provider (PROVIDER_DECODING_DICTIONARIES), so two providers sharing
// an id for the same (kind, code) pair is harmless, and adding the provider to the
// hash would change every id Sleeper has already persisted.
//
// Providers bind their own code-kind union and their own label once, via
// createProviderCodeRegistry — the label only surfaces in collision errors, and the
// bound union keeps a mistyped kind a compile error rather than a silently different
// id.

export interface ProviderCodeRegistry<Kind extends string> {
  encodeCode(kind: Kind, value: string, uppercase: boolean): number | undefined;
  encodeObservedCode<T>(
    kind: Kind,
    value: string,
    uppercase: boolean,
    dictionary: Readonly<Record<string, T>>,
  ): number | undefined;
  numericDictionary<T>(
    kind: Kind,
    dictionary: Readonly<Record<string, T>>,
    uppercase: boolean,
  ): Readonly<Partial<Record<number, T>>>;
  stableCodeId(kind: Kind, value: string): number;
}

export function normalizedCode(
  value: string,
  uppercase: boolean,
): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return uppercase ? trimmed.toUpperCase() : trimmed.toLowerCase();
}

export function stableCodeId(kind: string, value: string): number {
  let hash = 2_166_136_261;
  for (const character of `${kind}:${value}`) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0) & 0x7fff_ffff || 1;
}

export function encodeCode(
  kind: string,
  value: string,
  uppercase: boolean,
): number | undefined {
  const normalized = normalizedCode(value, uppercase);
  return normalized ? stableCodeId(kind, normalized) : undefined;
}

// Positive id: the dictionary knows this code. Negative id: it does not, which is
// how an unknown code reaches the integrity check instead of vanishing.
export function encodeObservedCode<T>(
  kind: string,
  value: string,
  uppercase: boolean,
  dictionary: Readonly<Record<string, T>>,
): number | undefined {
  const normalized = normalizedCode(value, uppercase);
  if (!normalized) return undefined;
  const id = stableCodeId(kind, normalized);
  return dictionary[normalized] === undefined ? -id : id;
}

// Throws at module load if two codes hash to the same id, so a collision is a
// startup crash rather than a dictionary that silently loses an entry.
export function numericDictionary<T>(
  provider: string,
  kind: string,
  dictionary: Readonly<Record<string, T>>,
  uppercase: boolean,
): Readonly<Partial<Record<number, T>>> {
  const entries: [number, T][] = [];
  const rawById = new Map<number, string>();
  for (const [rawCode, definition] of Object.entries(dictionary)) {
    const id = encodeCode(kind, rawCode, uppercase);
    if (id === undefined) continue;
    const collision = rawById.get(id);
    if (collision && collision !== rawCode) {
      throw new Error(
        `${provider} ${kind} adapter collision: ${collision} and ${rawCode} encode to ${id}`,
      );
    }
    rawById.set(id, rawCode);
    entries.push([id, definition]);
  }
  return Object.freeze(Object.fromEntries(entries));
}

export function createProviderCodeRegistry<Kind extends string>(
  provider: string,
): ProviderCodeRegistry<Kind> {
  return {
    encodeCode,
    encodeObservedCode,
    numericDictionary<T>(
      kind: Kind,
      dictionary: Readonly<Record<string, T>>,
      uppercase: boolean,
    ) {
      return numericDictionary(provider, kind, dictionary, uppercase);
    },
    stableCodeId,
  };
}
