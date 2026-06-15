import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { type LeagueScopedTx, withLeagueContext } from "@/db/rls";
import {
  allTimeRecords,
  type LoreClaim,
  leagues,
  loreClaims,
  loreSubjects,
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
  LoreSubjectFilter,
  LoreSubjectSummary,
  LoreSubmitOptions,
  LoreVoteStatusSummary,
} from "./member-ui";

const DEFAULT_QUORUM_RATIO = 0.34;
const CANON_LIMIT = 25;
const OPEN_VOTE_LIMIT = 6;
const SUBJECT_FILTER_LIMIT = 16;
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
  input: { leagueId: string; subject?: string | null },
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
    const activeSubject = parseLoreSubjectKey(input.subject ?? null);
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
    const canon = await listCanonCardsInContext(tx, {
      leagueId: input.leagueId,
      limit: CANON_LIMIT,
      subject: activeSubject,
    });
    const subjectFilters = await listLoreSubjectFiltersInContext(tx, {
      leagueId: input.leagueId,
      limit: SUBJECT_FILTER_LIMIT,
    });

    return {
      activeSubject:
        activeSubject === null
          ? null
          : (subjectFilters.find(
              (subject) => subject.key === activeSubject.key,
            ) ?? null),
      canon,
      counts: counts ?? { canon: 0, openVotes: 0, refuted: 0, total: 0 },
      openVotes,
      subjectFilters,
      submitOptions: await getLoreSubmitOptionsInContext(tx, input),
    };
  });

  return {
    data: {
      activeSubject: scoped.activeSubject,
      canon: scoped.canon,
      counts: scoped.counts,
      league,
      openVotes: scoped.openVotes,
      subjectFilters: scoped.subjectFilters,
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

    const threadRootId = claimRow.threadRootId ?? claimRow.id;
    const threadRows = await selectThreadClaimRowsInContext(tx, {
      leagueId: input.leagueId,
      threadRootId,
    });
    const rowsById = new Map(threadRows.map((row) => [row.id, row]));
    rowsById.set(claimRow.id, claimRow);
    const rows = [...rowsById.values()].sort(
      (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
    );
    const voteClaimIds = rows
      .filter((row) => row.status === "vote")
      .map((row) => row.id);
    const voteStatusByClaimId = await getVoteStatusesForClaimsInContext(tx, {
      claimIds: voteClaimIds,
      leagueId: input.leagueId,
      memberId: input.memberId,
    });
    const subjectsByClaimId = await getLoreSubjectsByClaimIdInContext(tx, {
      claimIds: rows.map((row) => row.id),
      leagueId: input.leagueId,
    });
    const thread = rows.map((row) =>
      serializeClaimCard(
        row,
        voteStatusByClaimId.get(row.id) ?? null,
        subjectsByClaimId.get(row.id) ?? [],
      ),
    );
    const claim = thread.find((item) => item.id === input.claimId);
    if (!claim) {
      return null;
    }
    const verificationResult = await getLoreClaimVerificationSummaryInContext(
      tx,
      {
        claimId: input.claimId,
        leagueId: input.leagueId,
      },
    );

    return {
      claim,
      thread,
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
      claimSubmitApiUrl: `/api/leagues/${encodeURIComponent(input.leagueId)}/lore/claims`,
      stewardApiUrl: `/api/leagues/${encodeURIComponent(input.leagueId)}/lore/claims/${encodeURIComponent(input.claimId)}/steward`,
      stewardReviewHref: `/leagues/${encodeURIComponent(input.leagueId)}/lore/steward`,
      thread: scoped.thread,
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
    const subjectsByClaimId = await getLoreSubjectsByClaimIdInContext(tx, {
      claimIds: [claimRow.id],
      leagueId: input.leagueId,
    });

    return serializeClaimCard(
      claimRow,
      vote,
      subjectsByClaimId.get(claimRow.id) ?? [],
    );
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

async function selectCanonClaimRowsInContext(
  tx: LeagueScopedTx,
  input: {
    leagueId: string;
    limit: number;
    subject: ParsedLoreSubjectKey | null;
  },
): Promise<ClaimRow[]> {
  const filters = [
    eq(loreClaims.leagueId, input.leagueId),
    inArray(loreClaims.status, ["canon", "disputed"]),
  ];

  if (input.subject) {
    const claimIds = await listClaimIdsForSubjectInContext(tx, {
      leagueId: input.leagueId,
      subject: input.subject,
    });
    if (claimIds.length === 0) {
      return [];
    }
    filters.push(inArray(loreClaims.id, claimIds));
  }

  return tx
    .select(claimSelectFields())
    .from(loreClaims)
    .leftJoin(members, eq(members.id, loreClaims.authorMemberId))
    .leftJoin(users, eq(users.id, members.userId))
    .where(and(...filters))
    .orderBy(
      sql`${loreClaims.ratifiedAt} desc nulls last`,
      desc(loreClaims.createdAt),
    )
    .limit(input.limit);
}

async function selectThreadClaimRowsInContext(
  tx: LeagueScopedTx,
  input: { leagueId: string; threadRootId: string },
): Promise<ClaimRow[]> {
  return tx
    .select(claimSelectFields())
    .from(loreClaims)
    .leftJoin(members, eq(members.id, loreClaims.authorMemberId))
    .leftJoin(users, eq(users.id, members.userId))
    .where(
      and(
        eq(loreClaims.leagueId, input.leagueId),
        or(
          eq(loreClaims.id, input.threadRootId),
          eq(loreClaims.threadRootId, input.threadRootId),
        ),
      ),
    )
    .orderBy(asc(loreClaims.createdAt), asc(loreClaims.id));
}

async function hydrateClaimCardsInContext(
  tx: LeagueScopedTx,
  input: {
    claimRows: readonly ClaimRow[];
    leagueId: string;
    memberId?: string;
  },
): Promise<LoreClaimCard[]> {
  if (input.claimRows.length === 0) {
    return [];
  }

  const voteClaimIds = input.claimRows
    .filter((claim) => claim.status === "vote")
    .map((claim) => claim.id);
  const voteStatusByClaimId = await getVoteStatusesForClaimsInContext(tx, {
    claimIds: voteClaimIds,
    leagueId: input.leagueId,
    memberId: input.memberId,
  });
  const subjectsByClaimId = await getLoreSubjectsByClaimIdInContext(tx, {
    claimIds: input.claimRows.map((claim) => claim.id),
    leagueId: input.leagueId,
  });

  return input.claimRows.map((claim) =>
    serializeClaimCard(
      claim,
      voteStatusByClaimId.get(claim.id) ?? null,
      subjectsByClaimId.get(claim.id) ?? [],
    ),
  );
}

async function listCanonCardsInContext(
  tx: LeagueScopedTx,
  input: {
    leagueId: string;
    limit: number;
    subject: ParsedLoreSubjectKey | null;
  },
): Promise<LoreClaimCard[]> {
  const claimRows = await selectCanonClaimRowsInContext(tx, input);
  return hydrateClaimCardsInContext(tx, {
    claimRows,
    leagueId: input.leagueId,
  });
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

  return hydrateClaimCardsInContext(tx, {
    claimRows,
    leagueId: input.leagueId,
  });
}

type ParsedLoreSubjectKey =
  | { key: string; personId: string; type: "person" }
  | { key: string; personAId: string; personBId: string; type: "rivalry" }
  | { key: string; season: number; type: "season" }
  | { key: string; season: number; type: "week"; week: number }
  | { key: string; recordType: string; type: "record" };

type LoreSubjectRow = {
  readonly claimId: string;
  readonly personAId: string | null;
  readonly personBId: string | null;
  readonly personId: string | null;
  readonly recordType: string | null;
  readonly season: number | null;
  readonly subjectType: "person" | "record" | "rivalry" | "season" | "week";
  readonly week: number | null;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parsePositiveInt(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseLoreSubjectKey(
  value: string | null,
): ParsedLoreSubjectKey | null {
  if (!value) {
    return null;
  }

  const [type, first, second] = value.split(":");
  switch (type) {
    case "person":
      return first && UUID_PATTERN.test(first)
        ? { key: `person:${first}`, personId: first, type }
        : null;
    case "rivalry":
      return first &&
        second &&
        UUID_PATTERN.test(first) &&
        UUID_PATTERN.test(second)
        ? {
            key: `rivalry:${first}:${second}`,
            personAId: first,
            personBId: second,
            type,
          }
        : null;
    case "season": {
      const season = parsePositiveInt(first);
      return season ? { key: `season:${season}`, season, type } : null;
    }
    case "week": {
      const season = parsePositiveInt(first);
      const week = parsePositiveInt(second);
      return season && week
        ? { key: `week:${season}:${week}`, season, type, week }
        : null;
    }
    case "record": {
      const recordType = first?.trim();
      return recordType && recordType.length <= 120
        ? { key: `record:${recordType}`, recordType, type }
        : null;
    }
    default:
      return null;
  }
}

function titleCase(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

async function personNamesByIdInContext(
  tx: LeagueScopedTx,
  input: { leagueId: string; personIds: readonly string[] },
): Promise<Map<string, string>> {
  const personIds = [...new Set(input.personIds)];
  if (personIds.length === 0) {
    return new Map();
  }

  const rows = await tx
    .select({
      id: persons.id,
      name: persons.canonicalName,
    })
    .from(persons)
    .where(
      and(eq(persons.leagueId, input.leagueId), inArray(persons.id, personIds)),
    );

  return new Map(rows.map((person) => [person.id, person.name]));
}

function subjectSummaryFromRow(
  row: LoreSubjectRow,
  personNamesById: ReadonlyMap<string, string>,
): LoreSubjectSummary | null {
  switch (row.subjectType) {
    case "person":
      return row.personId
        ? {
            key: `person:${row.personId}`,
            label: personNamesById.get(row.personId) ?? "Unknown person",
            type: "person",
          }
        : null;
    case "rivalry":
      return row.personAId && row.personBId
        ? {
            key: `rivalry:${row.personAId}:${row.personBId}`,
            label: `${personNamesById.get(row.personAId) ?? "Unknown person"} vs ${personNamesById.get(row.personBId) ?? "Unknown person"}`,
            type: "rivalry",
          }
        : null;
    case "season":
      return row.season
        ? {
            key: `season:${row.season}`,
            label: `${row.season} season`,
            type: "season",
          }
        : null;
    case "week":
      return row.season && row.week
        ? {
            key: `week:${row.season}:${row.week}`,
            label: `Week ${row.week}, ${row.season}`,
            type: "week",
          }
        : null;
    case "record":
      return row.recordType
        ? {
            key: `record:${row.recordType}`,
            label: titleCase(row.recordType),
            type: "record",
          }
        : null;
  }
}

function subjectPersonIds(rows: readonly LoreSubjectRow[]): string[] {
  return [
    ...new Set(
      rows
        .flatMap((row) => [row.personId, row.personAId, row.personBId])
        .filter((id): id is string => Boolean(id)),
    ),
  ];
}

async function getLoreSubjectsByClaimIdInContext(
  tx: LeagueScopedTx,
  input: { claimIds: readonly string[]; leagueId: string },
): Promise<Map<string, LoreSubjectSummary[]>> {
  const claimIds = [...new Set(input.claimIds)];
  if (claimIds.length === 0) {
    return new Map();
  }

  const rows: LoreSubjectRow[] = await tx
    .select({
      claimId: loreSubjects.claimId,
      personAId: loreSubjects.personAId,
      personBId: loreSubjects.personBId,
      personId: loreSubjects.personId,
      recordType: loreSubjects.recordType,
      season: loreSubjects.season,
      subjectType: loreSubjects.subjectType,
      week: loreSubjects.week,
    })
    .from(loreSubjects)
    .where(
      and(
        eq(loreSubjects.leagueId, input.leagueId),
        inArray(loreSubjects.claimId, claimIds),
      ),
    )
    .orderBy(asc(loreSubjects.createdAt), asc(loreSubjects.id));

  const personNamesById = await personNamesByIdInContext(tx, {
    leagueId: input.leagueId,
    personIds: subjectPersonIds(rows),
  });
  const subjectsByClaimId = new Map<string, LoreSubjectSummary[]>();
  const seenByClaimId = new Map<string, Set<string>>();

  for (const row of rows) {
    const summary = subjectSummaryFromRow(row, personNamesById);
    if (!summary) {
      continue;
    }
    const seen = seenByClaimId.get(row.claimId) ?? new Set<string>();
    if (seen.has(summary.key)) {
      continue;
    }
    seen.add(summary.key);
    seenByClaimId.set(row.claimId, seen);
    const subjects = subjectsByClaimId.get(row.claimId) ?? [];
    subjects.push(summary);
    subjectsByClaimId.set(row.claimId, subjects);
  }

  return subjectsByClaimId;
}

async function listLoreSubjectFiltersInContext(
  tx: LeagueScopedTx,
  input: { leagueId: string; limit: number },
): Promise<LoreSubjectFilter[]> {
  const rows: LoreSubjectRow[] = await tx
    .select({
      claimId: loreSubjects.claimId,
      personAId: loreSubjects.personAId,
      personBId: loreSubjects.personBId,
      personId: loreSubjects.personId,
      recordType: loreSubjects.recordType,
      season: loreSubjects.season,
      subjectType: loreSubjects.subjectType,
      week: loreSubjects.week,
    })
    .from(loreSubjects)
    .innerJoin(
      loreClaims,
      and(
        eq(loreClaims.leagueId, loreSubjects.leagueId),
        eq(loreClaims.id, loreSubjects.claimId),
      ),
    )
    .where(
      and(
        eq(loreSubjects.leagueId, input.leagueId),
        inArray(loreClaims.status, ["canon", "disputed"]),
      ),
    )
    .limit(500);

  const personNamesById = await personNamesByIdInContext(tx, {
    leagueId: input.leagueId,
    personIds: subjectPersonIds(rows),
  });
  const filtersByKey = new Map<string, LoreSubjectFilter>();

  for (const row of rows) {
    const summary = subjectSummaryFromRow(row, personNamesById);
    if (!summary) {
      continue;
    }
    const current = filtersByKey.get(summary.key);
    filtersByKey.set(summary.key, {
      ...summary,
      count: (current?.count ?? 0) + 1,
    });
  }

  return [...filtersByKey.values()]
    .sort((left, right) => {
      const countSort = right.count - left.count;
      return countSort === 0
        ? left.label.localeCompare(right.label)
        : countSort;
    })
    .slice(0, input.limit);
}

function subjectCondition(subject: ParsedLoreSubjectKey) {
  switch (subject.type) {
    case "person":
      return or(
        eq(loreSubjects.personId, subject.personId),
        eq(loreSubjects.personAId, subject.personId),
        eq(loreSubjects.personBId, subject.personId),
      );
    case "record":
      return eq(loreSubjects.recordType, subject.recordType);
    case "rivalry":
      return or(
        and(
          eq(loreSubjects.personAId, subject.personAId),
          eq(loreSubjects.personBId, subject.personBId),
        ),
        and(
          eq(loreSubjects.personAId, subject.personBId),
          eq(loreSubjects.personBId, subject.personAId),
        ),
      );
    case "season":
      return eq(loreSubjects.season, subject.season);
    case "week":
      return and(
        eq(loreSubjects.season, subject.season),
        eq(loreSubjects.week, subject.week),
      );
  }
}

async function listClaimIdsForSubjectInContext(
  tx: LeagueScopedTx,
  input: { leagueId: string; subject: ParsedLoreSubjectKey },
): Promise<string[]> {
  const rows = await tx
    .select({ claimId: loreSubjects.claimId })
    .from(loreSubjects)
    .where(
      and(
        eq(loreSubjects.leagueId, input.leagueId),
        subjectCondition(input.subject),
      ),
    )
    .limit(500);

  return [...new Set(rows.map((row) => row.claimId))];
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
  subjects: readonly LoreSubjectSummary[],
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
    subjects,
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
