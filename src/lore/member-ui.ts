import type {
  LoreClaimKind,
  LoreClaimOrigin,
  LoreClaimRelation,
  LoreClaimVerification,
  LoreVoteChoice,
  LoreVoteTally,
  SeasonLoreMetric,
  StewardLoreAction,
  WeeklyLoreMetric,
} from "./engine";

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

export const LORE_VOTE_CHOICES = [
  "affirm",
  "reject",
  "abstain",
] as const satisfies readonly LoreVoteChoice[];

export const LORE_STEWARD_ACTIONS = [
  "ratify",
  "reject",
  "extend",
  "veto",
] as const satisfies readonly StewardLoreAction[];

export type LoreAssertionSource = (typeof LORE_ASSERTION_SOURCES)[number];

export type LoreClaimStatus =
  | "canon"
  | "disputed"
  | "pending"
  | "rejected"
  | "superseded"
  | "vote"
  | "withdrawn";

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
  readonly openVotes: readonly LoreClaimCard[];
  readonly submitOptions: LoreSubmitOptions;
  readonly stewardReviewHref: string;
}

export interface LoreClaimAuthorSummary {
  readonly displayName: string;
  readonly isAi: boolean;
}

export interface LoreVoteStatusSummary {
  readonly affirmNeeded: number;
  readonly currentChoice: LoreVoteChoice | null;
  readonly isOpen: boolean;
  readonly passesAtClose: boolean;
  readonly quorumMet: boolean;
  readonly tally: LoreVoteTally;
  readonly voteClosesAt: string | null;
  readonly voteOpensAt: string | null;
}

export interface LoreClaimCard {
  readonly author: LoreClaimAuthorSummary;
  readonly bodyPreview: string;
  readonly branchOf: string | null;
  readonly createdAt: string;
  readonly id: string;
  readonly kind: LoreClaimKind;
  readonly origin: LoreClaimOrigin;
  readonly ratifiedAt: string | null;
  readonly ratifiedBy: "steward" | "verified" | "vote" | null;
  readonly relation: LoreClaimRelation;
  readonly status: LoreClaimStatus;
  readonly title: string;
  readonly verification: LoreClaimVerification;
  readonly vote: LoreVoteStatusSummary | null;
}

export interface LoreClaimDetailData {
  readonly claim: LoreClaimCard & {
    readonly body: string;
    readonly statement: string;
    readonly threadRootId: string | null;
    readonly updatedAt: string;
  };
  readonly isSteward: boolean;
  readonly league: {
    readonly id: string;
    readonly name: string;
  };
  readonly stewardApiUrl: string;
  readonly stewardReviewHref: string;
  readonly verificationResult: LoreClaimVerificationSummary | null;
  readonly voteApiUrl: string;
}

export interface LoreStewardReviewData {
  readonly league: {
    readonly id: string;
    readonly name: string;
  };
  readonly openVotes: readonly LoreClaimCard[];
}

export type LoreVoteCastResponse = LoreClaimDetailData["claim"]["vote"] & {
  readonly claimId: string;
};

export type LoreStewardActionResponse =
  | {
      readonly claim: LoreClaimCard;
      readonly result: {
        readonly claimId: string;
        readonly ratifiedBy: "steward";
        readonly status: "canonized";
      };
    }
  | {
      readonly claim: LoreClaimCard;
      readonly result: {
        readonly claimId: string;
        readonly status: "rejected";
      };
    }
  | {
      readonly claim: LoreClaimCard;
      readonly result: {
        readonly claimId: string;
        readonly status: "extended";
        readonly voteClosesAt: string;
      };
    };

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
