import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { type LeagueScopedTx, withLeagueContext } from "@/db/rls";
import {
  allTimeRecords,
  type LoreClaim,
  leagues,
  loreClaims,
  loreVerifications,
  loreVotes,
  members,
  persons,
  seasonStatistics,
  users,
  weeklyStatistics,
} from "@/db/schema";
import type { LoreVoteChoice, LoreVoteTally } from "./engine";
import type {
  LoreClaimAuthorSummary,
  LoreClaimCard,
  LoreClaimDetailData,
  LoreClaimVerificationSummary,
  LoreSectionData,
  LoreStewardReviewData,
  LoreSubmitOptions,
  LoreVoteStatusSummary,
} from "./member-ui";

const DEFAULT_QUORUM_RATIO = 0.34;
const OPEN_VOTE_LIMIT = 6;
const BODY_PREVIEW_LIMIT = 180;

export type LoreSectionResult =
  | {
      readonly data: LoreSectionData;
      readonly status: "ready";
    }
  | {
      readonly status: "not_found";
    };

export async function getLoreSectionData(
  db: Db,
  input: { leagueId: string },
): Promise<LoreSectionResult> {
  const [league] = await db
    .select({
      id: leagues.id,
      name: leagues.name,
    })
    .from(leagues)
    .where(eq(leagues.id, input.leagueId))
    .limit(1);

  if (!league) {
    return { status: "not_found" };
  }

  const scoped = await withLeagueContext(db, input.leagueId, async (tx) => {
    const [counts] = await tx
      .select({
        canon: sql<number>`count(*) filter (where ${loreClaims.status} = 'canon')::int`,
        openVotes: sql<number>`count(*) filter (where ${loreClaims.status} = 'vote')::int`,
        refuted: sql<number>`count(*) filter (where ${loreClaims.verification} = 'refuted')::int`,
        total: sql<number>`count(*)::int`,
      })
      .from(loreClaims)
      .where(eq(loreClaims.leagueId, input.leagueId));

    const openVotes = await listOpenVoteCardsInContext(tx, {
      leagueId: input.leagueId,
      limit: OPEN_VOTE_LIMIT,
    });

    return {
      counts: counts ?? { canon: 0, openVotes: 0, refuted: 0, total: 0 },
      openVotes,
      submitOptions: await getLoreSubmitOptionsInContext(tx, input),
    };
  });

  return {
    data: {
      counts: scoped.counts,
      league,
      openVotes: scoped.openVotes,
      submitOptions: scoped.submitOptions,
      stewardReviewHref: `/leagues/${encodeURIComponent(input.leagueId)}/lore/steward`,
    },
    status: "ready",
  };
}

export type LoreClaimDetailResult =
  | {
      readonly data: LoreClaimDetailData;
      readonly status: "ready";
    }
  | {
      readonly status: "not_found";
    };

export async function getLoreClaimDetailData(
  db: Db,
  input: {
    claimId: string;
    isSteward: boolean;
    leagueId: string;
    memberId: string;
  },
): Promise<LoreClaimDetailResult> {
  const [league] = await db
    .select({
      id: leagues.id,
      name: leagues.name,
    })
    .from(leagues)
    .where(eq(leagues.id, input.leagueId))
    .limit(1);

  if (!league) {
    return { status: "not_found" };
  }

  const scoped = await withLeagueContext(db, input.leagueId, async (tx) => {
    const [claimRow] = await selectClaimRows(tx, input.leagueId, {
      claimId: input.claimId,
      limit: 1,
    });

    if (!claimRow) {
      return null;
    }

    const vote =
      claimRow.status === "vote"
        ? await getVoteStatusForClaimInContext(tx, {
            claimId: input.claimId,
            leagueId: input.leagueId,
            memberId: input.memberId,
            voteOpensAt: claimRow.voteOpensAt,
            voteClosesAt: claimRow.voteClosesAt,
          })
        : null;
    const verificationResult = await getLoreClaimVerificationSummaryInContext(
      tx,
      {
        claimId: input.claimId,
        leagueId: input.leagueId,
      },
    );

    return {
      claim: serializeClaimCard(claimRow, vote),
      verificationResult,
    };
  });

  if (!scoped) {
    return { status: "not_found" };
  }

  return {
    data: {
      claim: {
        ...scoped.claim,
        body: scoped.claim.body,
        statement: scoped.claim.statement,
        threadRootId: scoped.claim.threadRootId,
        updatedAt: scoped.claim.updatedAt,
      },
      isSteward: input.isSteward,
      league,
      stewardApiUrl: `/api/leagues/${encodeURIComponent(input.leagueId)}/lore/claims/${encodeURIComponent(input.claimId)}/steward`,
      stewardReviewHref: `/leagues/${encodeURIComponent(input.leagueId)}/lore/steward`,
      verificationResult: scoped.verificationResult,
      voteApiUrl: `/api/leagues/${encodeURIComponent(input.leagueId)}/lore/claims/${encodeURIComponent(input.claimId)}/votes`,
    },
    status: "ready",
  };
}

export type LoreStewardReviewResult =
  | {
      readonly data: LoreStewardReviewData;
      readonly status: "ready";
    }
  | {
      readonly status: "not_found";
    };

export async function getLoreStewardReviewData(
  db: Db,
  input: { leagueId: string },
): Promise<LoreStewardReviewResult> {
  const [league] = await db
    .select({
      id: leagues.id,
      name: leagues.name,
    })
    .from(leagues)
    .where(eq(leagues.id, input.leagueId))
    .limit(1);

  if (!league) {
    return { status: "not_found" };
  }

  const openVotes = await withLeagueContext(db, input.leagueId, (tx) =>
    listOpenVoteCardsInContext(tx, {
      leagueId: input.leagueId,
      limit: 50,
    }),
  );

  return {
    data: { league, openVotes },
    status: "ready",
  };
}

export async function getLoreClaimVoteStatus(
  db: Db,
  input: { claimId: string; leagueId: string; memberId?: string },
): Promise<LoreVoteStatusSummary | null> {
  return withLeagueContext(db, input.leagueId, async (tx) => {
    const [claim] = await tx
      .select({
        id: loreClaims.id,
        status: loreClaims.status,
        voteClosesAt: loreClaims.voteClosesAt,
        voteOpensAt: loreClaims.voteOpensAt,
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
      return null;
    }

    return getVoteStatusForClaimInContext(tx, {
      claimId: input.claimId,
      leagueId: input.leagueId,
      memberId: input.memberId,
      voteClosesAt: claim.voteClosesAt,
      voteOpensAt: claim.voteOpensAt,
    });
  });
}

export async function getLoreClaimCard(
  db: Db,
  input: { claimId: string; leagueId: string; memberId?: string },
): Promise<LoreClaimCard | null> {
  return withLeagueContext(db, input.leagueId, async (tx) => {
    const [claimRow] = await selectClaimRows(tx, input.leagueId, {
      claimId: input.claimId,
      limit: 1,
    });
    if (!claimRow) {
      return null;
    }

    const vote =
      claimRow.status === "vote"
        ? await getVoteStatusForClaimInContext(tx, {
            claimId: input.claimId,
            leagueId: input.leagueId,
            memberId: input.memberId,
            voteClosesAt: claimRow.voteClosesAt,
            voteOpensAt: claimRow.voteOpensAt,
          })
        : null;

    return serializeClaimCard(claimRow, vote);
  });
}

export async function getLoreSubmitOptions(
  db: Db,
  input: { leagueId: string },
): Promise<LoreSubmitOptions> {
  return withLeagueContext(db, input.leagueId, (tx) =>
    getLoreSubmitOptionsInContext(tx, input),
  );
}

export async function getLoreClaimVerificationSummary(
  db: Db,
  input: { claimId: string; leagueId: string },
): Promise<LoreClaimVerificationSummary | null> {
  return withLeagueContext(db, input.leagueId, (tx) =>
    getLoreClaimVerificationSummaryInContext(tx, input),
  );
}

async function getLoreClaimVerificationSummaryInContext(
  tx: LeagueScopedTx,
  input: { claimId: string; leagueId: string },
): Promise<LoreClaimVerificationSummary | null> {
  const [verification] = await tx
    .select({
      actualValue: loreVerifications.actualValue,
      assertedValue: loreVerifications.assertedValue,
      result: loreVerifications.result,
    })
    .from(loreVerifications)
    .where(
      and(
        eq(loreVerifications.leagueId, input.leagueId),
        eq(loreVerifications.claimId, input.claimId),
      ),
    )
    .limit(1);

  return verification ?? null;
}

type ClaimRow = Pick<
  LoreClaim,
  | "body"
  | "branchOf"
  | "createdAt"
  | "id"
  | "kind"
  | "origin"
  | "authorPersona"
  | "ratifiedAt"
  | "ratifiedBy"
  | "relation"
  | "statement"
  | "status"
  | "threadRootId"
  | "title"
  | "updatedAt"
  | "verification"
  | "voteClosesAt"
  | "voteOpensAt"
> & {
  readonly authorDisplayName: string | null;
};

type SerializedClaimDetailFields = {
  readonly body: string;
  readonly statement: string;
  readonly threadRootId: string | null;
  readonly updatedAt: string;
};

function claimSelectFields() {
  return {
    authorDisplayName: users.displayName,
    authorPersona: loreClaims.authorPersona,
    body: loreClaims.body,
    branchOf: loreClaims.branchOf,
    createdAt: loreClaims.createdAt,
    id: loreClaims.id,
    kind: loreClaims.kind,
    origin: loreClaims.origin,
    ratifiedAt: loreClaims.ratifiedAt,
    ratifiedBy: loreClaims.ratifiedBy,
    relation: loreClaims.relation,
    statement: loreClaims.statement,
    status: loreClaims.status,
    threadRootId: loreClaims.threadRootId,
    title: loreClaims.title,
    updatedAt: loreClaims.updatedAt,
    verification: loreClaims.verification,
    voteClosesAt: loreClaims.voteClosesAt,
    voteOpensAt: loreClaims.voteOpensAt,
  };
}

async function selectClaimRows(
  tx: LeagueScopedTx,
  leagueId: string,
  input:
    | { claimId: string; limit: 1 }
    | { limit: number; status: LoreClaim["status"] },
): Promise<ClaimRow[]> {
  const filters = [eq(loreClaims.leagueId, leagueId)];
  if ("claimId" in input) {
    filters.push(eq(loreClaims.id, input.claimId));
  } else {
    filters.push(eq(loreClaims.status, input.status));
  }

  return tx
    .select(claimSelectFields())
    .from(loreClaims)
    .leftJoin(members, eq(members.id, loreClaims.authorMemberId))
    .leftJoin(users, eq(users.id, members.userId))
    .where(and(...filters))
    .orderBy(
      sql`${loreClaims.voteClosesAt} asc nulls last`,
      desc(loreClaims.createdAt),
    )
    .limit(input.limit);
}

async function listOpenVoteCardsInContext(
  tx: LeagueScopedTx,
  input: { leagueId: string; limit: number },
): Promise<LoreClaimCard[]> {
  const claimRows = await selectClaimRows(tx, input.leagueId, {
    limit: input.limit,
    status: "vote",
  });
  if (claimRows.length === 0) {
    return [];
  }

  const voteStatusByClaimId = await getVoteStatusesForClaimsInContext(tx, {
    claimIds: claimRows.map((claim) => claim.id),
    leagueId: input.leagueId,
  });

  return claimRows.map((claim) =>
    serializeClaimCard(claim, voteStatusByClaimId.get(claim.id) ?? null),
  );
}

async function getVoteStatusForClaimInContext(
  tx: LeagueScopedTx,
  input: {
    claimId: string;
    leagueId: string;
    memberId?: string;
    voteClosesAt: Date | null;
    voteOpensAt: Date | null;
  },
): Promise<LoreVoteStatusSummary> {
  const voteStatusByClaimId = await getVoteStatusesForClaimsInContext(tx, {
    claimIds: [input.claimId],
    leagueId: input.leagueId,
    memberId: input.memberId,
  });
  const status = voteStatusByClaimId.get(input.claimId);
  if (status) {
    return status;
  }

  return serializeVoteStatus({
    currentChoice: null,
    tally: buildTally({
      activeMembers: await countActiveMembersInContext(tx, input.leagueId),
      votes: [],
    }),
    voteClosesAt: input.voteClosesAt,
    voteOpensAt: input.voteOpensAt,
  });
}

async function getVoteStatusesForClaimsInContext(
  tx: LeagueScopedTx,
  input: { claimIds: readonly string[]; leagueId: string; memberId?: string },
): Promise<Map<string, LoreVoteStatusSummary>> {
  if (input.claimIds.length === 0) {
    return new Map();
  }

  const activeMembers = await countActiveMembersInContext(tx, input.leagueId);
  const claimRows = await tx
    .select({
      id: loreClaims.id,
      voteClosesAt: loreClaims.voteClosesAt,
      voteOpensAt: loreClaims.voteOpensAt,
    })
    .from(loreClaims)
    .where(
      and(
        eq(loreClaims.leagueId, input.leagueId),
        inArray(loreClaims.id, [...input.claimIds]),
      ),
    );
  const voteRows = await tx
    .select({
      choice: loreVotes.choice,
      claimId: loreVotes.claimId,
      voterMemberId: loreVotes.voterMemberId,
    })
    .from(loreVotes)
    .where(
      and(
        eq(loreVotes.leagueId, input.leagueId),
        inArray(loreVotes.claimId, [...input.claimIds]),
      ),
    );

  const votesByClaimId = new Map<string, typeof voteRows>();
  for (const vote of voteRows) {
    const votes = votesByClaimId.get(vote.claimId) ?? [];
    votes.push(vote);
    votesByClaimId.set(vote.claimId, votes);
  }

  return new Map(
    claimRows.map((claim) => {
      const votes = votesByClaimId.get(claim.id) ?? [];
      const currentChoice =
        input.memberId === undefined
          ? null
          : (votes.find((vote) => vote.voterMemberId === input.memberId)
              ?.choice ?? null);
      return [
        claim.id,
        serializeVoteStatus({
          currentChoice,
          tally: buildTally({ activeMembers, votes }),
          voteClosesAt: claim.voteClosesAt,
          voteOpensAt: claim.voteOpensAt,
        }),
      ];
    }),
  );
}

async function countActiveMembersInContext(
  tx: LeagueScopedTx,
  leagueId: string,
): Promise<number> {
  const [count] = await tx
    .select({ activeMembers: sql<number>`count(*)::int` })
    .from(members)
    .where(eq(members.organizationId, leagueId));

  return count?.activeMembers ?? 0;
}

function buildTally({
  activeMembers,
  votes,
}: {
  activeMembers: number;
  votes: readonly { choice: LoreVoteChoice }[];
}): LoreVoteTally {
  const tally: LoreVoteTally = {
    abstain: 0,
    activeMembers,
    affirm: 0,
    quorum: Math.max(3, Math.ceil(activeMembers * DEFAULT_QUORUM_RATIO)),
    quorumRatio: DEFAULT_QUORUM_RATIO,
    reject: 0,
    totalVotes: votes.length,
  };

  for (const vote of votes) {
    tally[vote.choice] += 1;
  }

  return tally;
}

function serializeVoteStatus({
  currentChoice,
  tally,
  voteClosesAt,
  voteOpensAt,
}: {
  currentChoice: LoreVoteChoice | null;
  tally: LoreVoteTally;
  voteClosesAt: Date | null;
  voteOpensAt: Date | null;
}): LoreVoteStatusSummary {
  const quorumMet = tally.affirm >= tally.quorum;
  const passesAtClose = tally.affirm > tally.reject && quorumMet;
  const affirmNeededForLead = Math.max(0, tally.reject - tally.affirm + 1);
  const affirmNeededForQuorum = Math.max(0, tally.quorum - tally.affirm);
  const now = new Date();

  return {
    affirmNeeded: Math.max(affirmNeededForLead, affirmNeededForQuorum),
    currentChoice,
    isOpen: voteClosesAt === null || now <= voteClosesAt,
    passesAtClose,
    quorumMet,
    tally,
    voteClosesAt: voteClosesAt?.toISOString() ?? null,
    voteOpensAt: voteOpensAt?.toISOString() ?? null,
  };
}

function serializeClaimCard(
  claim: ClaimRow,
  vote: LoreVoteStatusSummary | null,
): LoreClaimCard & SerializedClaimDetailFields {
  return {
    author: claimAuthor(claim),
    body: claim.body,
    bodyPreview: previewText(claim.body),
    branchOf: claim.branchOf,
    createdAt: claim.createdAt.toISOString(),
    id: claim.id,
    kind: claim.kind,
    origin: claim.origin,
    ratifiedAt: claim.ratifiedAt?.toISOString() ?? null,
    ratifiedBy: claim.ratifiedBy,
    relation: claim.relation,
    statement: claim.statement,
    status: claim.status,
    threadRootId: claim.threadRootId,
    title: claim.title,
    updatedAt: claim.updatedAt.toISOString(),
    verification: claim.verification,
    vote,
  };
}

function claimAuthor(claim: ClaimRow): LoreClaimAuthorSummary {
  if (claim.origin === "ai") {
    return {
      displayName: claim.authorPersona
        ? claim.authorPersona.replaceAll("_", " ")
        : "AI cast",
      isAi: true,
    };
  }

  return {
    displayName: claim.authorDisplayName ?? "League member",
    isAi: false,
  };
}

function previewText(value: string): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= BODY_PREVIEW_LIMIT) {
    return compact;
  }

  return `${compact.slice(0, BODY_PREVIEW_LIMIT - 1).trimEnd()}...`;
}

async function getLoreSubmitOptionsInContext(
  tx: LeagueScopedTx,
  input: { leagueId: string },
): Promise<LoreSubmitOptions> {
  const people = await tx
    .select({
      id: persons.id,
      name: persons.canonicalName,
    })
    .from(persons)
    .where(eq(persons.leagueId, input.leagueId))
    .orderBy(asc(persons.canonicalName))
    .limit(100);

  const seasonRows = await tx
    .select({ season: seasonStatistics.season })
    .from(seasonStatistics)
    .where(eq(seasonStatistics.leagueId, input.leagueId))
    .groupBy(seasonStatistics.season)
    .orderBy(desc(seasonStatistics.season));

  const weekRows = await tx
    .select({
      season: weeklyStatistics.season,
      week: weeklyStatistics.scoringPeriod,
    })
    .from(weeklyStatistics)
    .where(eq(weeklyStatistics.leagueId, input.leagueId))
    .groupBy(weeklyStatistics.season, weeklyStatistics.scoringPeriod)
    .orderBy(
      desc(weeklyStatistics.season),
      asc(weeklyStatistics.scoringPeriod),
    );

  const recordRows = await tx
    .select({ recordType: allTimeRecords.recordType })
    .from(allTimeRecords)
    .where(
      and(
        eq(allTimeRecords.leagueId, input.leagueId),
        eq(allTimeRecords.isCurrent, true),
      ),
    )
    .groupBy(allTimeRecords.recordType)
    .orderBy(asc(allTimeRecords.recordType));

  const weeksBySeason = new Map<number, number[]>();
  for (const row of weekRows) {
    const weeks = weeksBySeason.get(row.season) ?? [];
    weeks.push(row.week);
    weeksBySeason.set(row.season, weeks);
  }

  const seasonSet = new Set([
    ...seasonRows.map((row) => row.season),
    ...weekRows.map((row) => row.season),
  ]);
  const seasons = [...seasonSet]
    .sort((left, right) => right - left)
    .map((season) => ({
      season,
      weeks: weeksBySeason.get(season) ?? [],
    }));

  return {
    people,
    recordTypes: recordRows.map((row) => ({
      label: row.recordType.replaceAll("_", " "),
      recordType: row.recordType,
    })),
    seasons,
  };
}
