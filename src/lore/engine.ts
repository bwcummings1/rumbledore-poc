import { and, eq } from "drizzle-orm";
import { AppError } from "@/core/result";
import type { Db } from "@/db/client";
import { type LeagueScopedTx, withLeagueContext } from "@/db/rls";
import {
  allTimeRecords,
  type LoreClaim,
  loreClaims,
  loreEvents,
  loreSubjects,
  loreVerifications,
  loreVotes,
  members,
  type NewLoreSubject,
  type NewLoreVerification,
  seasonStatistics,
  weeklyStatistics,
} from "@/db/schema";

const DEFAULT_VOTE_DAYS = 7;
const DEFAULT_QUORUM_RATIO = 0.34;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type LoreVoteChoice = "affirm" | "reject" | "abstain";
export type LoreClaimOrigin = "member" | "ai";
export type LoreClaimKind = "data_verifiable" | "opinion";
export type LoreClaimVerification =
  | "verified"
  | "refuted"
  | "unverifiable"
  | "n_a";
export type LoreClaimRelation =
  | "root"
  | "response"
  | "addendum"
  | "dispute"
  | "relitigation";
export type LoreVerificationValue = boolean | number | string;
export type WeeklyLoreMetric =
  | "points_against"
  | "points_for"
  | "margin"
  | "weekly_rank";
export type SeasonLoreMetric =
  | "avg_points_for"
  | "final_placement"
  | "final_rank"
  | "highest_score"
  | "losses"
  | "lowest_score"
  | "made_championship"
  | "made_playoffs"
  | "point_differential"
  | "points_against"
  | "points_for"
  | "ties"
  | "wins";

export interface WeeklyLoreAssertion {
  source: "weekly_statistics";
  metric: WeeklyLoreMetric;
  personId: string;
  season: number;
  scoringPeriod: number;
  assertedValue: LoreVerificationValue;
}

export interface SeasonLoreAssertion {
  source: "season_statistics";
  metric: SeasonLoreMetric;
  personId: string;
  season: number;
  assertedValue: LoreVerificationValue;
}

export interface AllTimeRecordLoreAssertion {
  source: "all_time_record";
  recordType: string;
  assertedValue: LoreVerificationValue;
  holderPersonId?: string;
  season?: number;
  scoringPeriod?: number;
}

export type LoreVerificationAssertion =
  | AllTimeRecordLoreAssertion
  | SeasonLoreAssertion
  | WeeklyLoreAssertion;

export interface LoreSubjectInput {
  subjectType: "person" | "rivalry" | "season" | "week" | "record";
  allTimeRecordId?: string | null;
  headToHeadRecordId?: string | null;
  metadata?: Record<string, unknown>;
  personAId?: string | null;
  personBId?: string | null;
  personId?: string | null;
  recordType?: string | null;
  season?: number | null;
  week?: number | null;
}

export interface LoreDependencies {
  db: Db;
  now?: () => Date;
}

export interface OpenOpinionClaimInput {
  leagueId: string;
  title: string;
  body: string;
  authorMemberId?: string;
  authorPersona?: LoreClaim["authorPersona"];
  origin?: LoreClaimOrigin;
  branchOf?: string;
  relation?: LoreClaimRelation;
  subjects?: LoreSubjectInput[];
  voteClosesAt?: Date;
}

export interface OpenOpinionClaimResult {
  claimId: string;
  threadRootId: string;
  voteClosesAt: Date;
}

export interface SubmitLoreClaimInput extends OpenOpinionClaimInput {
  assertions?: LoreVerificationAssertion[];
}

export type SubmitLoreClaimResult =
  | {
      status: "canonized";
      claimId: string;
      kind: "data_verifiable";
      ratifiedBy: "verified";
      threadRootId: string;
      verification: "verified";
    }
  | {
      status: "rejected";
      claimId: string;
      kind: "data_verifiable";
      threadRootId: string;
      verification: "refuted";
    }
  | {
      status: "vote";
      claimId: string;
      kind: LoreClaimKind;
      threadRootId: string;
      verification: "n_a" | "unverifiable";
      voteClosesAt: Date;
    };

export interface CastLoreVoteInput {
  leagueId: string;
  claimId: string;
  voterMemberId: string;
  choice: LoreVoteChoice;
}

export interface CastLoreVoteResult {
  claimId: string;
  choice: LoreVoteChoice;
  voterMemberId: string;
}

export interface LoreVoteTally {
  abstain: number;
  activeMembers: number;
  affirm: number;
  quorum: number;
  quorumRatio: number;
  reject: number;
  totalVotes: number;
}

export type CloseLoreVoteResult =
  | {
      status: "canonized";
      reused: boolean;
      claimId: string;
      ratifiedBy: "vote" | "steward" | "verified";
      tally: LoreVoteTally | null;
    }
  | {
      status: "rejected";
      reused: boolean;
      claimId: string;
      tally: LoreVoteTally | null;
    };

export type StewardLoreAction = "ratify" | "reject" | "extend" | "veto";

export interface StewardLoreClaimInput {
  leagueId: string;
  claimId: string;
  actorMemberId: string;
  action: StewardLoreAction;
  reason: string;
  extendUntil?: Date;
}

export type StewardLoreClaimResult =
  | {
      status: "canonized";
      claimId: string;
      ratifiedBy: "steward";
    }
  | {
      status: "rejected";
      claimId: string;
    }
  | {
      status: "extended";
      claimId: string;
      voteClosesAt: Date;
    };

function currentTime(deps: Pick<LoreDependencies, "now">): Date {
  return deps.now?.() ?? new Date();
}

function defaultVoteClosesAt(base: Date): Date {
  return new Date(base.getTime() + DEFAULT_VOTE_DAYS * MS_PER_DAY);
}

function cleanText(value: string, field: string): string {
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) {
    throw new AppError({
      code: "LORE_INVALID",
      message: `${field} is required`,
      status: 400,
    });
  }
  return text;
}

function claimSnapshot(
  claim: Pick<
    LoreClaim,
    | "id"
    | "status"
    | "ratifiedAt"
    | "ratifiedBy"
    | "voteClosesAt"
    | "threadRootId"
  >,
) {
  return {
    id: claim.id,
    ratifiedAt: claim.ratifiedAt?.toISOString() ?? null,
    ratifiedBy: claim.ratifiedBy,
    status: claim.status,
    threadRootId: claim.threadRootId,
    voteClosesAt: claim.voteClosesAt?.toISOString() ?? null,
  };
}

function assertVoteChoice(choice: LoreVoteChoice): LoreVoteChoice {
  if (choice === "affirm" || choice === "reject" || choice === "abstain") {
    return choice;
  }
  throw new AppError({
    code: "LORE_VOTE_CHOICE_INVALID",
    message: "Lore vote choice is invalid",
    status: 400,
  });
}

function assertOpenClaimAuthor(input: OpenOpinionClaimInput): LoreClaimOrigin {
  const origin = input.origin ?? "member";
  if (origin === "member" && !input.authorMemberId) {
    throw new AppError({
      code: "LORE_AUTHOR_REQUIRED",
      message: "Member lore claims require an author member",
      status: 400,
    });
  }
  if (origin === "ai" && !input.authorPersona) {
    throw new AppError({
      code: "LORE_AI_PERSONA_REQUIRED",
      message: "AI lore claims require an author persona",
      status: 400,
    });
  }
  return origin;
}

function relationFor(input: OpenOpinionClaimInput): LoreClaimRelation {
  if (!input.branchOf) {
    return "root";
  }
  return input.relation ?? "response";
}

function valueToText(
  value: LoreVerificationValue | null | undefined,
): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return String(value);
    }
    return String(Math.round(value * 10_000) / 10_000);
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return value.replace(/\s+/g, " ").trim();
}

function numericValue(value: LoreVerificationValue): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string") {
    return null;
  }
  const text = value.trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(text)) {
    return null;
  }
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function valuesMatch({
  actual,
  asserted,
}: {
  actual: LoreVerificationValue;
  asserted: LoreVerificationValue;
}): boolean {
  const assertedNumeric = numericValue(asserted);
  const actualNumeric = numericValue(actual);
  if (assertedNumeric !== null && actualNumeric !== null) {
    return Math.abs(assertedNumeric - actualNumeric) < 0.0001;
  }

  return (
    valueToText(asserted)?.toLowerCase() === valueToText(actual)?.toLowerCase()
  );
}

function subjectRowsFor({
  claimId,
  leagueId,
  subjects,
}: {
  claimId: string;
  leagueId: string;
  subjects: readonly LoreSubjectInput[];
}): NewLoreSubject[] {
  return subjects.map((subject) => ({
    allTimeRecordId: subject.allTimeRecordId ?? undefined,
    claimId,
    headToHeadRecordId: subject.headToHeadRecordId ?? undefined,
    leagueId,
    metadata: subject.metadata ?? {},
    personAId: subject.personAId ?? undefined,
    personBId: subject.personBId ?? undefined,
    personId: subject.personId ?? undefined,
    recordType: subject.recordType ?? undefined,
    season: subject.season ?? undefined,
    subjectType: subject.subjectType,
    week: subject.week ?? undefined,
  }));
}

function buildTally({
  activeMembers,
  quorumRatio,
  votes,
}: {
  activeMembers: number;
  quorumRatio: number;
  votes: readonly { choice: LoreVoteChoice }[];
}): LoreVoteTally {
  const tally: LoreVoteTally = {
    abstain: 0,
    activeMembers,
    affirm: 0,
    quorum: Math.max(3, Math.ceil(activeMembers * quorumRatio)),
    quorumRatio,
    reject: 0,
    totalVotes: votes.length,
  };

  for (const vote of votes) {
    tally[vote.choice] += 1;
  }

  return tally;
}

function shouldCanonize(tally: LoreVoteTally): boolean {
  return tally.affirm > tally.reject && tally.affirm >= tally.quorum;
}

interface VerificationOutcome {
  actualValue: string | null;
  allTimeRecordId?: string;
  assertedValue: string;
  matchedRefs: Record<string, unknown>[];
  result: "contradiction" | "match" | "uncheckable";
  seasonStatisticId?: string;
  subject: LoreSubjectInput;
  weeklyStatisticId?: string;
}

function outcomeFromActual({
  actual,
  asserted,
  matchedRef,
  subject,
}: {
  actual: LoreVerificationValue | null;
  asserted: LoreVerificationValue;
  matchedRef: Record<string, unknown> | null;
  subject: LoreSubjectInput;
}): Pick<
  VerificationOutcome,
  "actualValue" | "assertedValue" | "matchedRefs" | "result" | "subject"
> {
  const assertedValue = valueToText(asserted);
  if (assertedValue === null) {
    throw new AppError({
      code: "LORE_ASSERTION_INVALID",
      message: "Lore verification asserted value is invalid",
      status: 400,
    });
  }

  if (actual === null) {
    return {
      actualValue: null,
      assertedValue,
      matchedRefs: matchedRef ? [matchedRef] : [],
      result: "uncheckable",
      subject,
    };
  }

  const actualValue = valueToText(actual);
  return {
    actualValue,
    assertedValue,
    matchedRefs: matchedRef ? [matchedRef] : [],
    result: valuesMatch({ actual, asserted }) ? "match" : "contradiction",
    subject,
  };
}

function weeklyActualValue(
  row: {
    margin: number;
    pointsAgainst: number;
    pointsFor: number;
    weeklyRank: number;
  },
  metric: WeeklyLoreMetric,
): LoreVerificationValue {
  switch (metric) {
    case "margin":
      return row.margin;
    case "points_against":
      return row.pointsAgainst;
    case "points_for":
      return row.pointsFor;
    case "weekly_rank":
      return row.weeklyRank;
  }
}

function seasonActualValue(
  row: {
    avgPointsFor: number;
    finalPlacement: string;
    finalRank: number;
    highestScore: number;
    losses: number;
    lowestScore: number;
    madeChampionship: boolean;
    madePlayoffs: boolean;
    pointDifferential: number;
    pointsAgainst: number;
    pointsFor: number;
    ties: number;
    wins: number;
  },
  metric: SeasonLoreMetric,
): LoreVerificationValue {
  switch (metric) {
    case "avg_points_for":
      return row.avgPointsFor;
    case "final_placement":
      return row.finalPlacement;
    case "final_rank":
      return row.finalRank;
    case "highest_score":
      return row.highestScore;
    case "losses":
      return row.losses;
    case "lowest_score":
      return row.lowestScore;
    case "made_championship":
      return row.madeChampionship;
    case "made_playoffs":
      return row.madePlayoffs;
    case "point_differential":
      return row.pointDifferential;
    case "points_against":
      return row.pointsAgainst;
    case "points_for":
      return row.pointsFor;
    case "ties":
      return row.ties;
    case "wins":
      return row.wins;
  }
}

async function verifyWeeklyAssertion({
  assertion,
  leagueId,
  tx,
}: {
  assertion: WeeklyLoreAssertion;
  leagueId: string;
  tx: LeagueScopedTx;
}): Promise<VerificationOutcome> {
  const subject: LoreSubjectInput = {
    metadata: {
      metric: assertion.metric,
      source: assertion.source,
    },
    personId: assertion.personId,
    season: assertion.season,
    subjectType: "week",
    week: assertion.scoringPeriod,
  };
  const [row] = await tx
    .select({
      id: weeklyStatistics.id,
      margin: weeklyStatistics.margin,
      pointsAgainst: weeklyStatistics.pointsAgainst,
      pointsFor: weeklyStatistics.pointsFor,
      weeklyRank: weeklyStatistics.weeklyRank,
    })
    .from(weeklyStatistics)
    .where(
      and(
        eq(weeklyStatistics.leagueId, leagueId),
        eq(weeklyStatistics.personId, assertion.personId),
        eq(weeklyStatistics.season, assertion.season),
        eq(weeklyStatistics.scoringPeriod, assertion.scoringPeriod),
      ),
    )
    .limit(1);

  if (!row) {
    return {
      ...outcomeFromActual({
        actual: null,
        asserted: assertion.assertedValue,
        matchedRef: null,
        subject,
      }),
    };
  }

  const actual = weeklyActualValue(row, assertion.metric);
  return {
    ...outcomeFromActual({
      actual,
      asserted: assertion.assertedValue,
      matchedRef: {
        id: row.id,
        metric: assertion.metric,
        source: assertion.source,
      },
      subject,
    }),
    weeklyStatisticId: row.id,
  };
}

async function verifySeasonAssertion({
  assertion,
  leagueId,
  tx,
}: {
  assertion: SeasonLoreAssertion;
  leagueId: string;
  tx: LeagueScopedTx;
}): Promise<VerificationOutcome> {
  const subject: LoreSubjectInput = {
    metadata: {
      metric: assertion.metric,
      source: assertion.source,
    },
    personId: assertion.personId,
    season: assertion.season,
    subjectType: "season",
  };
  const [row] = await tx
    .select({
      avgPointsFor: seasonStatistics.avgPointsFor,
      finalPlacement: seasonStatistics.finalPlacement,
      finalRank: seasonStatistics.finalRank,
      highestScore: seasonStatistics.highestScore,
      id: seasonStatistics.id,
      losses: seasonStatistics.losses,
      lowestScore: seasonStatistics.lowestScore,
      madeChampionship: seasonStatistics.madeChampionship,
      madePlayoffs: seasonStatistics.madePlayoffs,
      pointDifferential: seasonStatistics.pointDifferential,
      pointsAgainst: seasonStatistics.pointsAgainst,
      pointsFor: seasonStatistics.pointsFor,
      ties: seasonStatistics.ties,
      wins: seasonStatistics.wins,
    })
    .from(seasonStatistics)
    .where(
      and(
        eq(seasonStatistics.leagueId, leagueId),
        eq(seasonStatistics.personId, assertion.personId),
        eq(seasonStatistics.season, assertion.season),
      ),
    )
    .limit(1);

  if (!row) {
    return {
      ...outcomeFromActual({
        actual: null,
        asserted: assertion.assertedValue,
        matchedRef: null,
        subject,
      }),
    };
  }

  const actual = seasonActualValue(row, assertion.metric);
  return {
    ...outcomeFromActual({
      actual,
      asserted: assertion.assertedValue,
      matchedRef: {
        id: row.id,
        metric: assertion.metric,
        source: assertion.source,
      },
      subject,
    }),
    seasonStatisticId: row.id,
  };
}

async function verifyAllTimeRecordAssertion({
  assertion,
  leagueId,
  tx,
}: {
  assertion: AllTimeRecordLoreAssertion;
  leagueId: string;
  tx: LeagueScopedTx;
}): Promise<VerificationOutcome> {
  const conditions = [
    eq(allTimeRecords.leagueId, leagueId),
    eq(allTimeRecords.recordType, assertion.recordType),
    eq(allTimeRecords.isCurrent, true),
  ];
  if (assertion.holderPersonId) {
    conditions.push(
      eq(allTimeRecords.holderPersonId, assertion.holderPersonId),
    );
  }
  if (assertion.season !== undefined) {
    conditions.push(eq(allTimeRecords.season, assertion.season));
  }
  if (assertion.scoringPeriod !== undefined) {
    conditions.push(eq(allTimeRecords.scoringPeriod, assertion.scoringPeriod));
  }

  const [row] = await tx
    .select({
      holderPersonId: allTimeRecords.holderPersonId,
      id: allTimeRecords.id,
      scoringPeriod: allTimeRecords.scoringPeriod,
      season: allTimeRecords.season,
      value: allTimeRecords.value,
    })
    .from(allTimeRecords)
    .where(and(...conditions))
    .limit(1);
  const subject: LoreSubjectInput = {
    allTimeRecordId: row?.id,
    metadata: { source: assertion.source },
    personId: assertion.holderPersonId ?? row?.holderPersonId,
    recordType: assertion.recordType,
    season: assertion.season ?? row?.season,
    subjectType: "record",
    week: assertion.scoringPeriod ?? row?.scoringPeriod,
  };

  if (!row) {
    return {
      ...outcomeFromActual({
        actual: null,
        asserted: assertion.assertedValue,
        matchedRef: null,
        subject,
      }),
    };
  }

  return {
    ...outcomeFromActual({
      actual: row.value,
      asserted: assertion.assertedValue,
      matchedRef: {
        id: row.id,
        recordType: assertion.recordType,
        source: assertion.source,
      },
      subject,
    }),
    allTimeRecordId: row.id,
  };
}

async function verifyAssertion({
  assertion,
  leagueId,
  tx,
}: {
  assertion: LoreVerificationAssertion;
  leagueId: string;
  tx: LeagueScopedTx;
}): Promise<VerificationOutcome> {
  switch (assertion.source) {
    case "all_time_record":
      return verifyAllTimeRecordAssertion({ assertion, leagueId, tx });
    case "season_statistics":
      return verifySeasonAssertion({ assertion, leagueId, tx });
    case "weekly_statistics":
      return verifyWeeklyAssertion({ assertion, leagueId, tx });
  }
}

function aggregateVerificationResult(
  outcomes: readonly VerificationOutcome[],
): "contradiction" | "match" | "uncheckable" {
  let contradictions = 0;
  let matches = 0;
  for (const outcome of outcomes) {
    switch (outcome.result) {
      case "contradiction":
        contradictions += 1;
        break;
      case "match":
        matches += 1;
        break;
      case "uncheckable":
        break;
    }
  }

  if (contradictions > 0) {
    return "contradiction";
  }
  if (matches === outcomes.length) {
    return "match";
  }
  return "uncheckable";
}

function verificationRecordFor({
  claimId,
  leagueId,
  outcomes,
  result,
}: {
  claimId: string;
  leagueId: string;
  outcomes: readonly VerificationOutcome[];
  result: "contradiction" | "match" | "uncheckable";
}): NewLoreVerification {
  const pointed = outcomes.find(
    (outcome) =>
      outcome.weeklyStatisticId ||
      outcome.seasonStatisticId ||
      outcome.allTimeRecordId,
  );
  const assertedValues = outcomes.map((outcome) => outcome.assertedValue);
  const actualValues = outcomes.map((outcome) => outcome.actualValue);

  return {
    actualValue:
      actualValues.length === 1
        ? actualValues[0]
        : JSON.stringify(actualValues),
    allTimeRecordId: pointed?.allTimeRecordId,
    assertedValue:
      assertedValues.length === 1
        ? assertedValues[0]
        : JSON.stringify(assertedValues),
    claimId,
    leagueId,
    matchedRefs: outcomes.flatMap((outcome) => outcome.matchedRefs),
    result,
    seasonStatisticId: pointed?.seasonStatisticId,
    weeklyStatisticId: pointed?.weeklyStatisticId,
  };
}

async function assertLeagueMember({
  memberId,
  leagueId,
  tx,
}: {
  memberId: string;
  leagueId: string;
  tx: LeagueScopedTx;
}) {
  const [member] = await tx
    .select({ id: members.id, role: members.role })
    .from(members)
    .where(and(eq(members.id, memberId), eq(members.organizationId, leagueId)))
    .limit(1);

  if (!member) {
    throw new AppError({
      code: "LORE_MEMBER_NOT_FOUND",
      message: "Lore actions require a member of the league",
      status: 403,
    });
  }

  return member;
}

async function assertStewardMember({
  memberId,
  leagueId,
  tx,
}: {
  memberId: string;
  leagueId: string;
  tx: LeagueScopedTx;
}) {
  const member = await assertLeagueMember({ leagueId, memberId, tx });
  if (member.role !== "commissioner" && member.role !== "data_steward") {
    throw new AppError({
      code: "LORE_STEWARD_REQUIRED",
      message: "Lore adjudication requires a commissioner or data steward",
      status: 403,
    });
  }
  return member;
}

async function resolveThreadRoot({
  input,
  tx,
}: {
  input: OpenOpinionClaimInput;
  tx: LeagueScopedTx;
}): Promise<string | null> {
  if (!input.branchOf) {
    return null;
  }

  const [parent] = await tx
    .select({
      id: loreClaims.id,
      threadRootId: loreClaims.threadRootId,
    })
    .from(loreClaims)
    .where(
      and(
        eq(loreClaims.leagueId, input.leagueId),
        eq(loreClaims.id, input.branchOf),
      ),
    )
    .limit(1);

  if (!parent) {
    throw new AppError({
      code: "LORE_PARENT_NOT_FOUND",
      message: "Parent lore claim could not be found",
      status: 404,
    });
  }

  return parent.threadRootId ?? parent.id;
}

async function ensureThreadRoot({
  claim,
  leagueId,
  timestamp,
  tx,
}: {
  claim: Pick<LoreClaim, "id" | "threadRootId">;
  leagueId: string;
  timestamp: Date;
  tx: LeagueScopedTx;
}): Promise<string> {
  const threadRootId = claim.threadRootId ?? claim.id;
  if (!claim.threadRootId) {
    await tx
      .update(loreClaims)
      .set({ threadRootId, updatedAt: timestamp })
      .where(
        and(eq(loreClaims.leagueId, leagueId), eq(loreClaims.id, claim.id)),
      );
  }
  return threadRootId;
}

async function insertLoreSubjects({
  claimId,
  leagueId,
  subjects,
  tx,
}: {
  claimId: string;
  leagueId: string;
  subjects: readonly LoreSubjectInput[];
  tx: LeagueScopedTx;
}) {
  if (subjects.length === 0) {
    return;
  }

  await tx.insert(loreSubjects).values(
    subjectRowsFor({
      claimId,
      leagueId,
      subjects,
    }),
  );
}

async function createVotingClaimInTx({
  extraSubjects = [],
  input,
  kind,
  timestamp,
  tx,
  verification,
  verificationData,
}: {
  extraSubjects?: readonly LoreSubjectInput[];
  input: OpenOpinionClaimInput;
  kind: LoreClaimKind;
  timestamp: Date;
  tx: LeagueScopedTx;
  verification: LoreClaimVerification;
  verificationData?: {
    outcomes: readonly VerificationOutcome[];
    result: "uncheckable";
  };
}): Promise<OpenOpinionClaimResult> {
  const title = cleanText(input.title, "title");
  const body = cleanText(input.body, "body");
  const origin = assertOpenClaimAuthor(input);
  const relation = relationFor(input);
  const voteClosesAt = input.voteClosesAt ?? defaultVoteClosesAt(timestamp);

  if (input.authorMemberId) {
    await assertLeagueMember({
      leagueId: input.leagueId,
      memberId: input.authorMemberId,
      tx,
    });
  }

  const threadRootId = await resolveThreadRoot({ input, tx });
  const [claim] = await tx
    .insert(loreClaims)
    .values({
      authorMemberId: input.authorMemberId,
      authorPersona: input.authorPersona,
      body,
      branchOf: input.branchOf,
      kind,
      leagueId: input.leagueId,
      origin,
      relation,
      statement: body,
      status: "vote",
      threadRootId,
      title,
      verification,
      voteClosesAt,
      voteOpensAt: timestamp,
    })
    .returning({
      id: loreClaims.id,
      ratifiedAt: loreClaims.ratifiedAt,
      ratifiedBy: loreClaims.ratifiedBy,
      status: loreClaims.status,
      threadRootId: loreClaims.threadRootId,
      voteClosesAt: loreClaims.voteClosesAt,
    });

  if (!claim) {
    throw new AppError({
      code: "LORE_CLAIM_CREATE_FAILED",
      message: "Lore claim could not be opened",
      status: 500,
    });
  }

  const finalThreadRootId = await ensureThreadRoot({
    claim,
    leagueId: input.leagueId,
    timestamp,
    tx,
  });
  const subjects = [...extraSubjects, ...(input.subjects ?? [])];
  await insertLoreSubjects({
    claimId: claim.id,
    leagueId: input.leagueId,
    subjects,
    tx,
  });
  if (verificationData) {
    await tx.insert(loreVerifications).values(
      verificationRecordFor({
        claimId: claim.id,
        leagueId: input.leagueId,
        outcomes: verificationData.outcomes,
        result: verificationData.result,
      }),
    );
  }

  await tx.insert(loreEvents).values([
    {
      actorMemberId: input.authorMemberId,
      afterState: {
        ...claimSnapshot({ ...claim, threadRootId: finalThreadRootId }),
        kind,
        origin,
        relation,
        verification,
      },
      claimId: claim.id,
      kind: "created",
      leagueId: input.leagueId,
      reason: "claim_opened",
    },
    {
      actorMemberId: input.authorMemberId,
      afterState: {
        claimId: claim.id,
        status: "vote",
        verification,
        voteClosesAt: voteClosesAt.toISOString(),
        voteOpensAt: timestamp.toISOString(),
      },
      claimId: claim.id,
      kind: "vote_opened",
      leagueId: input.leagueId,
      reason: "claim_opened",
    },
  ]);

  return {
    claimId: claim.id,
    threadRootId: finalThreadRootId,
    voteClosesAt,
  };
}

async function createResolvedDataClaimInTx({
  input,
  outcomes,
  result,
  timestamp,
  tx,
}: {
  input: OpenOpinionClaimInput;
  outcomes: readonly VerificationOutcome[];
  result: "contradiction" | "match";
  timestamp: Date;
  tx: LeagueScopedTx;
}): Promise<Extract<SubmitLoreClaimResult, { kind: "data_verifiable" }>> {
  const title = cleanText(input.title, "title");
  const body = cleanText(input.body, "body");
  const origin = assertOpenClaimAuthor(input);
  const relation = relationFor(input);
  let status: "canon" | "rejected";
  let verification: "refuted" | "verified";
  let ratifiedAt: Date | null;
  let ratifiedBy: "verified" | null;
  let transitionKind: "ratified" | "rejected";
  switch (result) {
    case "match":
      status = "canon";
      verification = "verified";
      ratifiedAt = timestamp;
      ratifiedBy = "verified";
      transitionKind = "ratified";
      break;
    case "contradiction":
      status = "rejected";
      verification = "refuted";
      ratifiedAt = null;
      ratifiedBy = null;
      transitionKind = "rejected";
      break;
  }

  if (input.authorMemberId) {
    await assertLeagueMember({
      leagueId: input.leagueId,
      memberId: input.authorMemberId,
      tx,
    });
  }

  const threadRootId = await resolveThreadRoot({ input, tx });
  const [claim] = await tx
    .insert(loreClaims)
    .values({
      authorMemberId: input.authorMemberId,
      authorPersona: input.authorPersona,
      body,
      branchOf: input.branchOf,
      kind: "data_verifiable",
      leagueId: input.leagueId,
      origin,
      ratifiedAt,
      ratifiedBy,
      relation,
      statement: body,
      status,
      threadRootId,
      title,
      verification,
    })
    .returning({
      id: loreClaims.id,
      ratifiedAt: loreClaims.ratifiedAt,
      ratifiedBy: loreClaims.ratifiedBy,
      status: loreClaims.status,
      threadRootId: loreClaims.threadRootId,
      voteClosesAt: loreClaims.voteClosesAt,
    });

  if (!claim) {
    throw new AppError({
      code: "LORE_CLAIM_CREATE_FAILED",
      message: "Lore claim could not be opened",
      status: 500,
    });
  }

  const finalThreadRootId = await ensureThreadRoot({
    claim,
    leagueId: input.leagueId,
    timestamp,
    tx,
  });
  await insertLoreSubjects({
    claimId: claim.id,
    leagueId: input.leagueId,
    subjects: [
      ...outcomes.map((outcome) => outcome.subject),
      ...(input.subjects ?? []),
    ],
    tx,
  });
  await tx.insert(loreVerifications).values(
    verificationRecordFor({
      claimId: claim.id,
      leagueId: input.leagueId,
      outcomes,
      result,
    }),
  );

  const afterState = {
    ...claimSnapshot({ ...claim, threadRootId: finalThreadRootId }),
    kind: "data_verifiable",
    origin,
    relation,
    verification,
    verificationResult: result,
  };
  await tx.insert(loreEvents).values([
    {
      actorMemberId: input.authorMemberId,
      afterState,
      claimId: claim.id,
      kind: "created",
      leagueId: input.leagueId,
      reason: "claim_submitted",
    },
    {
      actorMemberId: input.authorMemberId,
      afterState,
      claimId: claim.id,
      kind: transitionKind,
      leagueId: input.leagueId,
      reason: `verification:${result}`,
    },
  ]);

  switch (result) {
    case "match":
      return {
        claimId: claim.id,
        kind: "data_verifiable",
        ratifiedBy: "verified",
        status: "canonized",
        threadRootId: finalThreadRootId,
        verification: "verified",
      };
    case "contradiction":
      return {
        claimId: claim.id,
        kind: "data_verifiable",
        status: "rejected",
        threadRootId: finalThreadRootId,
        verification: "refuted",
      };
  }
}

export async function openOpinionClaim({
  deps,
  input,
}: {
  deps: LoreDependencies;
  input: OpenOpinionClaimInput;
}): Promise<OpenOpinionClaimResult> {
  const timestamp = currentTime(deps);

  return withLeagueContext(deps.db, input.leagueId, (tx) =>
    createVotingClaimInTx({
      input,
      kind: "opinion",
      timestamp,
      tx,
      verification: "n_a",
    }),
  );
}

export async function submitLoreClaim({
  deps,
  input,
}: {
  deps: LoreDependencies;
  input: SubmitLoreClaimInput;
}): Promise<SubmitLoreClaimResult> {
  const timestamp = currentTime(deps);
  const assertions = input.assertions ?? [];

  return withLeagueContext(deps.db, input.leagueId, async (tx) => {
    if (assertions.length === 0) {
      const claim = await createVotingClaimInTx({
        input,
        kind: "opinion",
        timestamp,
        tx,
        verification: "n_a",
      });
      return {
        claimId: claim.claimId,
        kind: "opinion",
        status: "vote",
        threadRootId: claim.threadRootId,
        verification: "n_a",
        voteClosesAt: claim.voteClosesAt,
      };
    }

    const outcomes: VerificationOutcome[] = [];
    for (const assertion of assertions) {
      outcomes.push(
        await verifyAssertion({ assertion, leagueId: input.leagueId, tx }),
      );
    }

    switch (aggregateVerificationResult(outcomes)) {
      case "uncheckable": {
        const claim = await createVotingClaimInTx({
          extraSubjects: outcomes.map((outcome) => outcome.subject),
          input,
          kind: "data_verifiable",
          timestamp,
          tx,
          verification: "unverifiable",
          verificationData: { outcomes, result: "uncheckable" },
        });
        return {
          claimId: claim.claimId,
          kind: "data_verifiable",
          status: "vote",
          threadRootId: claim.threadRootId,
          verification: "unverifiable",
          voteClosesAt: claim.voteClosesAt,
        };
      }
      case "match":
        return createResolvedDataClaimInTx({
          input,
          outcomes,
          result: "match",
          timestamp,
          tx,
        });
      case "contradiction":
        return createResolvedDataClaimInTx({
          input,
          outcomes,
          result: "contradiction",
          timestamp,
          tx,
        });
    }
  });
}

export async function castLoreVote({
  deps,
  input,
}: {
  deps: LoreDependencies;
  input: CastLoreVoteInput;
}): Promise<CastLoreVoteResult> {
  const choice = assertVoteChoice(input.choice);
  const timestamp = currentTime(deps);

  return withLeagueContext(deps.db, input.leagueId, async (tx) => {
    await assertLeagueMember({
      leagueId: input.leagueId,
      memberId: input.voterMemberId,
      tx,
    });

    const [claim] = await tx
      .select({
        id: loreClaims.id,
        status: loreClaims.status,
        voteClosesAt: loreClaims.voteClosesAt,
      })
      .from(loreClaims)
      .where(
        and(
          eq(loreClaims.leagueId, input.leagueId),
          eq(loreClaims.id, input.claimId),
        ),
      )
      .limit(1);

    if (!claim) {
      throw new AppError({
        code: "LORE_CLAIM_NOT_FOUND",
        message: "Lore claim could not be found",
        status: 404,
      });
    }
    switch (claim.status) {
      case "vote":
        break;
      default:
        throw new AppError({
          code: "LORE_CLAIM_NOT_OPEN",
          message: "Lore claim is not open for voting",
          status: 409,
        });
    }
    if (claim.voteClosesAt && timestamp > claim.voteClosesAt) {
      throw new AppError({
        code: "LORE_VOTE_CLOSED",
        message: "Lore claim voting window has closed",
        status: 409,
      });
    }

    const [vote] = await tx
      .insert(loreVotes)
      .values({
        choice,
        claimId: input.claimId,
        leagueId: input.leagueId,
        updatedAt: timestamp,
        voterMemberId: input.voterMemberId,
      })
      .onConflictDoUpdate({
        set: {
          choice,
          updatedAt: timestamp,
        },
        target: [
          loreVotes.leagueId,
          loreVotes.claimId,
          loreVotes.voterMemberId,
        ],
      })
      .returning({
        choice: loreVotes.choice,
        claimId: loreVotes.claimId,
        voterMemberId: loreVotes.voterMemberId,
      });

    if (!vote) {
      throw new AppError({
        code: "LORE_VOTE_FAILED",
        message: "Lore vote could not be recorded",
        status: 500,
      });
    }

    await tx.insert(loreEvents).values({
      actorMemberId: input.voterMemberId,
      afterState: {
        choice,
        claimId: input.claimId,
        voterMemberId: input.voterMemberId,
      },
      claimId: input.claimId,
      kind: "voted",
      leagueId: input.leagueId,
      reason: "member_vote",
    });

    return vote;
  });
}

export async function closeLoreVote({
  deps,
  input,
}: {
  deps: LoreDependencies;
  input: { leagueId: string; claimId: string; quorumRatio?: number };
}): Promise<CloseLoreVoteResult> {
  const timestamp = currentTime(deps);
  const quorumRatio = input.quorumRatio ?? DEFAULT_QUORUM_RATIO;

  return withLeagueContext(deps.db, input.leagueId, async (tx) => {
    const [claim] = await tx
      .select({
        id: loreClaims.id,
        ratifiedAt: loreClaims.ratifiedAt,
        ratifiedBy: loreClaims.ratifiedBy,
        status: loreClaims.status,
        threadRootId: loreClaims.threadRootId,
        voteClosesAt: loreClaims.voteClosesAt,
      })
      .from(loreClaims)
      .where(
        and(
          eq(loreClaims.leagueId, input.leagueId),
          eq(loreClaims.id, input.claimId),
        ),
      )
      .limit(1);

    if (!claim) {
      throw new AppError({
        code: "LORE_CLAIM_NOT_FOUND",
        message: "Lore claim could not be found",
        status: 404,
      });
    }

    switch (claim.status) {
      case "canon":
        return {
          claimId: claim.id,
          ratifiedBy: claim.ratifiedBy ?? "vote",
          reused: true,
          status: "canonized",
          tally: null,
        };
      case "rejected":
        return {
          claimId: claim.id,
          reused: true,
          status: "rejected",
          tally: null,
        };
      case "vote":
        break;
      default:
        throw new AppError({
          code: "LORE_CLAIM_NOT_CLOSABLE",
          message: "Lore claim is not open for close-out",
          status: 409,
        });
    }

    const activeMembers = (
      await tx
        .select({ id: members.id })
        .from(members)
        .where(eq(members.organizationId, input.leagueId))
    ).length;
    const votes = await tx
      .select({ choice: loreVotes.choice })
      .from(loreVotes)
      .where(
        and(
          eq(loreVotes.leagueId, input.leagueId),
          eq(loreVotes.claimId, input.claimId),
        ),
      );
    const tally = buildTally({ activeMembers, quorumRatio, votes });
    const beforeState = claimSnapshot(claim);
    const nextStatus = shouldCanonize(tally) ? "canon" : "rejected";
    const ratifiedAt = nextStatus === "canon" ? timestamp : null;
    const ratifiedBy = nextStatus === "canon" ? "vote" : null;

    const [updated] = await tx
      .update(loreClaims)
      .set({
        ratifiedAt,
        ratifiedBy,
        status: nextStatus,
        updatedAt: timestamp,
      })
      .where(
        and(
          eq(loreClaims.leagueId, input.leagueId),
          eq(loreClaims.id, input.claimId),
          eq(loreClaims.status, "vote"),
        ),
      )
      .returning({
        id: loreClaims.id,
        ratifiedAt: loreClaims.ratifiedAt,
        ratifiedBy: loreClaims.ratifiedBy,
        status: loreClaims.status,
        threadRootId: loreClaims.threadRootId,
        voteClosesAt: loreClaims.voteClosesAt,
      });

    if (!updated) {
      throw new AppError({
        code: "LORE_CLAIM_CLOSE_FAILED",
        message: "Lore claim could not be closed",
        status: 409,
      });
    }

    await tx.insert(loreEvents).values({
      afterState: {
        ...claimSnapshot(updated),
        tally,
      },
      beforeState,
      claimId: input.claimId,
      kind: nextStatus === "canon" ? "ratified" : "rejected",
      leagueId: input.leagueId,
      reason:
        nextStatus === "canon" ? "vote_threshold_met" : "vote_threshold_failed",
    });

    if (nextStatus === "canon") {
      return {
        claimId: input.claimId,
        ratifiedBy: "vote",
        reused: false,
        status: "canonized",
        tally,
      };
    }

    return {
      claimId: input.claimId,
      reused: false,
      status: "rejected",
      tally,
    };
  });
}

export async function stewardLoreClaim({
  deps,
  input,
}: {
  deps: LoreDependencies;
  input: StewardLoreClaimInput;
}): Promise<StewardLoreClaimResult> {
  const timestamp = currentTime(deps);
  const reason = cleanText(input.reason, "reason");

  return withLeagueContext(deps.db, input.leagueId, async (tx) => {
    await assertStewardMember({
      leagueId: input.leagueId,
      memberId: input.actorMemberId,
      tx,
    });

    const [claim] = await tx
      .select({
        id: loreClaims.id,
        ratifiedAt: loreClaims.ratifiedAt,
        ratifiedBy: loreClaims.ratifiedBy,
        status: loreClaims.status,
        threadRootId: loreClaims.threadRootId,
        voteClosesAt: loreClaims.voteClosesAt,
      })
      .from(loreClaims)
      .where(
        and(
          eq(loreClaims.leagueId, input.leagueId),
          eq(loreClaims.id, input.claimId),
        ),
      )
      .limit(1);

    if (!claim) {
      throw new AppError({
        code: "LORE_CLAIM_NOT_FOUND",
        message: "Lore claim could not be found",
        status: 404,
      });
    }

    const beforeState = claimSnapshot(claim);
    switch (input.action) {
      case "veto": {
        switch (claim.status) {
          case "canon":
            break;
          default:
            throw new AppError({
              code: "LORE_CLAIM_NOT_VETOABLE",
              message: "Only canon lore claims can be vetoed",
              status: 409,
            });
        }

        const [updated] = await tx
          .update(loreClaims)
          .set({
            ratifiedAt: null,
            ratifiedBy: null,
            status: "rejected",
            updatedAt: timestamp,
          })
          .where(
            and(
              eq(loreClaims.leagueId, input.leagueId),
              eq(loreClaims.id, input.claimId),
              eq(loreClaims.status, "canon"),
            ),
          )
          .returning({
            id: loreClaims.id,
            ratifiedAt: loreClaims.ratifiedAt,
            ratifiedBy: loreClaims.ratifiedBy,
            status: loreClaims.status,
            threadRootId: loreClaims.threadRootId,
            voteClosesAt: loreClaims.voteClosesAt,
          });

        if (!updated) {
          throw new AppError({
            code: "LORE_STEWARD_ACTION_FAILED",
            message: "Lore claim could not be steward-adjudicated",
            status: 409,
          });
        }

        await tx.insert(loreEvents).values([
          {
            actorMemberId: input.actorMemberId,
            afterState: {
              ...claimSnapshot(updated),
              action: "veto",
              reason,
            },
            beforeState,
            claimId: input.claimId,
            kind: "steward_action",
            leagueId: input.leagueId,
            reason: "steward:veto",
          },
          {
            actorMemberId: input.actorMemberId,
            afterState: {
              ...claimSnapshot(updated),
              reason,
            },
            beforeState,
            claimId: input.claimId,
            kind: "rejected",
            leagueId: input.leagueId,
            reason: "steward:veto",
          },
        ]);

        return {
          claimId: input.claimId,
          status: "rejected",
        };
      }
      case "extend": {
        switch (claim.status) {
          case "vote":
            break;
          default:
            throw new AppError({
              code: "LORE_CLAIM_NOT_STEWARDABLE",
              message: "Only open lore votes can be steward-adjudicated",
              status: 409,
            });
        }

        const [previousExtension] = await tx
          .select({ id: loreEvents.id })
          .from(loreEvents)
          .where(
            and(
              eq(loreEvents.leagueId, input.leagueId),
              eq(loreEvents.claimId, input.claimId),
              eq(loreEvents.kind, "steward_action"),
              eq(loreEvents.reason, "steward:extend"),
            ),
          )
          .limit(1);

        if (previousExtension) {
          throw new AppError({
            code: "LORE_VOTE_ALREADY_EXTENDED",
            message: "Lore vote window can only be extended once",
            status: 409,
          });
        }

        const voteClosesAt =
          input.extendUntil ?? defaultVoteClosesAt(timestamp);
        if (voteClosesAt <= timestamp) {
          throw new AppError({
            code: "LORE_EXTENSION_INVALID",
            message: "Lore vote extension must end in the future",
            status: 400,
          });
        }

        const [updated] = await tx
          .update(loreClaims)
          .set({ updatedAt: timestamp, voteClosesAt })
          .where(
            and(
              eq(loreClaims.leagueId, input.leagueId),
              eq(loreClaims.id, input.claimId),
              eq(loreClaims.status, "vote"),
            ),
          )
          .returning({
            id: loreClaims.id,
            ratifiedAt: loreClaims.ratifiedAt,
            ratifiedBy: loreClaims.ratifiedBy,
            status: loreClaims.status,
            threadRootId: loreClaims.threadRootId,
            voteClosesAt: loreClaims.voteClosesAt,
          });

        if (!updated) {
          throw new AppError({
            code: "LORE_EXTENSION_FAILED",
            message: "Lore vote window could not be extended",
            status: 409,
          });
        }

        await tx.insert(loreEvents).values({
          actorMemberId: input.actorMemberId,
          afterState: {
            ...claimSnapshot(updated),
            action: "extend",
            reason,
          },
          beforeState,
          claimId: input.claimId,
          kind: "steward_action",
          leagueId: input.leagueId,
          reason: "steward:extend",
        });

        return {
          claimId: input.claimId,
          status: "extended",
          voteClosesAt,
        };
      }
      case "ratify":
      case "reject":
        break;
      default:
        throw new AppError({
          code: "LORE_STEWARD_ACTION_INVALID",
          message: "Lore steward action is invalid",
          status: 400,
        });
    }

    switch (claim.status) {
      case "vote":
        break;
      default:
        throw new AppError({
          code: "LORE_CLAIM_NOT_STEWARDABLE",
          message: "Only open lore votes can be steward-adjudicated",
          status: 409,
        });
    }

    let nextStatus: "canon" | "rejected";
    let ratifiedAt: Date | null;
    let ratifiedBy: "steward" | null;
    let transitionKind: "ratified" | "rejected";
    switch (input.action) {
      case "ratify":
        nextStatus = "canon";
        ratifiedAt = timestamp;
        ratifiedBy = "steward";
        transitionKind = "ratified";
        break;
      case "reject":
        nextStatus = "rejected";
        ratifiedAt = null;
        ratifiedBy = null;
        transitionKind = "rejected";
        break;
      default:
        throw new AppError({
          code: "LORE_STEWARD_ACTION_INVALID",
          message: "Lore steward action is invalid",
          status: 400,
        });
    }
    const [updated] = await tx
      .update(loreClaims)
      .set({
        ratifiedAt,
        ratifiedBy,
        status: nextStatus,
        updatedAt: timestamp,
      })
      .where(
        and(
          eq(loreClaims.leagueId, input.leagueId),
          eq(loreClaims.id, input.claimId),
          eq(loreClaims.status, "vote"),
        ),
      )
      .returning({
        id: loreClaims.id,
        ratifiedAt: loreClaims.ratifiedAt,
        ratifiedBy: loreClaims.ratifiedBy,
        status: loreClaims.status,
        threadRootId: loreClaims.threadRootId,
        voteClosesAt: loreClaims.voteClosesAt,
      });

    if (!updated) {
      throw new AppError({
        code: "LORE_STEWARD_ACTION_FAILED",
        message: "Lore claim could not be steward-adjudicated",
        status: 409,
      });
    }

    await tx.insert(loreEvents).values([
      {
        actorMemberId: input.actorMemberId,
        afterState: {
          ...claimSnapshot(updated),
          action: input.action,
          reason,
        },
        beforeState,
        claimId: input.claimId,
        kind: "steward_action",
        leagueId: input.leagueId,
        reason: `steward:${input.action}`,
      },
      {
        actorMemberId: input.actorMemberId,
        afterState: {
          ...claimSnapshot(updated),
          reason,
        },
        beforeState,
        claimId: input.claimId,
        kind: transitionKind,
        leagueId: input.leagueId,
        reason: `steward:${input.action}`,
      },
    ]);

    switch (input.action) {
      case "ratify":
        return {
          claimId: input.claimId,
          ratifiedBy: "steward",
          status: "canonized",
        };
      case "reject":
        return {
          claimId: input.claimId,
          status: "rejected",
        };
    }
  });
}
