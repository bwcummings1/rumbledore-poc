import {
  ESPN_ACTIVITY_BY_ID,
  ESPN_LINEUP_SLOT_BY_ID,
  ESPN_POSITION_BY_ID,
  ESPN_PRO_TEAM_BY_ID,
  ESPN_SCORING_STAT_BY_ID,
} from "./espn/reference-data";
import type { FantasyProviderId } from "./ids";
import { SLEEPER_PROVIDER_DECODING_DICTIONARY } from "./sleeper/reference-data";

export type ProviderCodeKind =
  | "activity"
  | "lineup_slot"
  | "position"
  | "pro_team"
  | "scoring_stat";

export interface ProviderCodeDictionaryMissingIssue {
  provider: FantasyProviderId;
  reason: "dictionary_missing";
}

export interface ProviderCodeUnknownIssue {
  id: number;
  kind: ProviderCodeKind;
  provider: FantasyProviderId;
  reason: "unknown_code";
}

export type ProviderCodeDecodingIssue =
  | ProviderCodeDictionaryMissingIssue
  | ProviderCodeUnknownIssue;

export interface ObservedProviderCodes {
  activities?: Iterable<number>;
  lineupSlots?: Iterable<number>;
  positions?: Iterable<number>;
  proTeams?: Iterable<number>;
  scoringStats?: Iterable<number>;
}

interface ProviderDecodingDictionary {
  activities: Readonly<Partial<Record<number, unknown>>>;
  lineupSlots: Readonly<Partial<Record<number, unknown>>>;
  positions: Readonly<Partial<Record<number, unknown>>>;
  proTeams: Readonly<Partial<Record<number, unknown>>>;
  scoringStats: Readonly<Partial<Record<number, unknown>>>;
}

const PROVIDER_DECODING_DICTIONARIES: Partial<
  Record<FantasyProviderId, ProviderDecodingDictionary>
> = {
  espn: {
    activities: ESPN_ACTIVITY_BY_ID,
    lineupSlots: ESPN_LINEUP_SLOT_BY_ID,
    positions: ESPN_POSITION_BY_ID,
    proTeams: ESPN_PRO_TEAM_BY_ID,
    scoringStats: ESPN_SCORING_STAT_BY_ID,
  },
  sleeper: SLEEPER_PROVIDER_DECODING_DICTIONARY,
};

function uniqueIntegers(values: Iterable<number> | undefined): number[] {
  return [...new Set(values ?? [])]
    .filter((value) => Number.isInteger(value))
    .sort((left, right) => left - right);
}

function missingIssues({
  dictionary,
  ids,
  kind,
  provider,
}: {
  dictionary: Readonly<Partial<Record<number, unknown>>>;
  ids: Iterable<number> | undefined;
  kind: ProviderCodeKind;
  provider: FantasyProviderId;
}): ProviderCodeDecodingIssue[] {
  return uniqueIntegers(ids)
    .filter((id) => dictionary[id] === undefined)
    .map((id) => ({ id, kind, provider, reason: "unknown_code" }));
}

export function providerCodeDecodingIssues(
  provider: FantasyProviderId,
  observed: ObservedProviderCodes,
): ProviderCodeDecodingIssue[] {
  const dictionary = PROVIDER_DECODING_DICTIONARIES[provider];
  if (!dictionary) {
    return [{ provider, reason: "dictionary_missing" }];
  }

  return [
    ...missingIssues({
      dictionary: dictionary.positions,
      ids: observed.positions,
      kind: "position",
      provider,
    }),
    ...missingIssues({
      dictionary: dictionary.lineupSlots,
      ids: observed.lineupSlots,
      kind: "lineup_slot",
      provider,
    }),
    ...missingIssues({
      dictionary: dictionary.proTeams,
      ids: observed.proTeams,
      kind: "pro_team",
      provider,
    }),
    ...missingIssues({
      dictionary: dictionary.scoringStats,
      ids: observed.scoringStats,
      kind: "scoring_stat",
      provider,
    }),
    ...missingIssues({
      dictionary: dictionary.activities,
      ids: observed.activities,
      kind: "activity",
      provider,
    }),
  ].sort((left, right) => {
    const providerOrder = left.provider.localeCompare(right.provider);
    if (providerOrder !== 0) {
      return providerOrder;
    }
    if (left.reason === "dictionary_missing") {
      return right.reason === "dictionary_missing" ? 0 : -1;
    }
    if (right.reason === "dictionary_missing") {
      return 1;
    }
    const kindOrder = left.kind.localeCompare(right.kind);
    return kindOrder !== 0 ? kindOrder : left.id - right.id;
  });
}
