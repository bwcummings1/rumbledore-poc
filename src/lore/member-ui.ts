import type { SeasonLoreMetric, WeeklyLoreMetric } from "./engine";

export const WEEKLY_LORE_METRICS = [
  "points_for",
  "points_against",
  "margin",
  "weekly_rank",
] as const satisfies readonly WeeklyLoreMetric[];

export const SEASON_LORE_METRICS = [
  "wins",
  "losses",
  "ties",
  "points_for",
  "points_against",
  "point_differential",
  "avg_points_for",
  "highest_score",
  "lowest_score",
  "final_rank",
  "final_placement",
  "made_playoffs",
  "made_championship",
] as const satisfies readonly SeasonLoreMetric[];

export const LORE_ASSERTION_SOURCES = [
  "weekly_statistics",
  "season_statistics",
  "all_time_record",
] as const;

export type LoreAssertionSource = (typeof LORE_ASSERTION_SOURCES)[number];

export interface LoreFormPersonOption {
  readonly id: string;
  readonly name: string;
}

export interface LoreFormSeasonOption {
  readonly season: number;
  readonly weeks: readonly number[];
}

export interface LoreFormRecordTypeOption {
  readonly label: string;
  readonly recordType: string;
}

export interface LoreSubmitOptions {
  readonly people: readonly LoreFormPersonOption[];
  readonly recordTypes: readonly LoreFormRecordTypeOption[];
  readonly seasons: readonly LoreFormSeasonOption[];
}

export interface LoreSectionData {
  readonly counts: {
    readonly canon: number;
    readonly openVotes: number;
    readonly refuted: number;
    readonly total: number;
  };
  readonly league: {
    readonly id: string;
    readonly name: string;
  };
  readonly submitOptions: LoreSubmitOptions;
}

export type LoreClaimSubmitResponse =
  | {
      readonly claimId: string;
      readonly kind: "data_verifiable";
      readonly ratifiedBy: "verified";
      readonly status: "canonized";
      readonly threadRootId: string;
      readonly verification: "verified";
      readonly verificationResult?: LoreClaimVerificationSummary | null;
    }
  | {
      readonly claimId: string;
      readonly kind: "data_verifiable";
      readonly status: "rejected";
      readonly threadRootId: string;
      readonly verification: "refuted";
      readonly verificationResult?: LoreClaimVerificationSummary | null;
    }
  | {
      readonly claimId: string;
      readonly kind: "data_verifiable" | "opinion";
      readonly status: "vote";
      readonly threadRootId: string;
      readonly verification: "n_a" | "unverifiable";
      readonly verificationResult?: LoreClaimVerificationSummary | null;
      readonly voteClosesAt: string;
    };

export interface LoreClaimVerificationSummary {
  readonly actualValue: string | null;
  readonly assertedValue: string;
  readonly result: "contradiction" | "match" | "uncheckable";
}

export function loreMetricLabel(metric: string): string {
  return metric
    .split("_")
    .map((piece) => piece.charAt(0).toUpperCase() + piece.slice(1))
    .join(" ");
}
