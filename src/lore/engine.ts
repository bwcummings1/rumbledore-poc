import { and, eq } from "drizzle-orm";
import { AppError } from "@/core/result";
import type { Db } from "@/db/client";
import { type LeagueScopedTx, withLeagueContext } from "@/db/rls";
import {
  type LoreClaim,
  loreClaims,
  loreEvents,
  loreVotes,
  members,
} from "@/db/schema";

const DEFAULT_VOTE_DAYS = 7;
const DEFAULT_QUORUM_RATIO = 0.34;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type LoreVoteChoice = "affirm" | "reject" | "abstain";
export type LoreClaimOrigin = "member" | "ai";
export type LoreClaimRelation =
  | "root"
  | "response"
  | "addendum"
  | "dispute"
  | "relitigation";

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
  voteClosesAt?: Date;
}

export interface OpenOpinionClaimResult {
  claimId: string;
  threadRootId: string;
  voteClosesAt: Date;
}

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

export async function openOpinionClaim({
  deps,
  input,
}: {
  deps: LoreDependencies;
  input: OpenOpinionClaimInput;
}): Promise<OpenOpinionClaimResult> {
  const timestamp = currentTime(deps);
  const title = cleanText(input.title, "title");
  const body = cleanText(input.body, "body");
  const origin = assertOpenClaimAuthor(input);
  const relation = relationFor(input);
  const voteClosesAt = input.voteClosesAt ?? defaultVoteClosesAt(timestamp);

  return withLeagueContext(deps.db, input.leagueId, async (tx) => {
    if (input.authorMemberId) {
      await assertLeagueMember({
        leagueId: input.leagueId,
        memberId: input.authorMemberId,
        tx,
      });
    }

    let threadRootId: string | null = null;
    if (input.branchOf) {
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

      threadRootId = parent.threadRootId ?? parent.id;
    }

    const [claim] = await tx
      .insert(loreClaims)
      .values({
        authorMemberId: input.authorMemberId,
        authorPersona: input.authorPersona,
        body,
        branchOf: input.branchOf,
        kind: "opinion",
        leagueId: input.leagueId,
        origin,
        relation,
        statement: body,
        status: "vote",
        threadRootId,
        title,
        verification: "n_a",
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

    const finalThreadRootId = claim.threadRootId ?? claim.id;
    if (!claim.threadRootId) {
      await tx
        .update(loreClaims)
        .set({ threadRootId: finalThreadRootId, updatedAt: timestamp })
        .where(
          and(
            eq(loreClaims.leagueId, input.leagueId),
            eq(loreClaims.id, claim.id),
          ),
        );
    }

    await tx.insert(loreEvents).values([
      {
        actorMemberId: input.authorMemberId,
        afterState: {
          ...claimSnapshot({ ...claim, threadRootId: finalThreadRootId }),
          origin,
          relation,
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
    if (claim.status !== "vote") {
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

    if (claim.status === "canon") {
      return {
        claimId: claim.id,
        ratifiedBy: claim.ratifiedBy ?? "vote",
        reused: true,
        status: "canonized",
        tally: null,
      };
    }
    if (claim.status === "rejected") {
      return {
        claimId: claim.id,
        reused: true,
        status: "rejected",
        tally: null,
      };
    }
    if (claim.status !== "vote") {
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
    if (input.action === "veto") {
      if (claim.status !== "canon") {
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

    if (claim.status !== "vote") {
      throw new AppError({
        code: "LORE_CLAIM_NOT_STEWARDABLE",
        message: "Only open lore votes can be steward-adjudicated",
        status: 409,
      });
    }

    if (input.action === "extend") {
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

      const voteClosesAt = input.extendUntil ?? defaultVoteClosesAt(timestamp);
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

    if (input.action !== "ratify" && input.action !== "reject") {
      throw new AppError({
        code: "LORE_STEWARD_ACTION_INVALID",
        message: "Lore steward action is invalid",
        status: 400,
      });
    }

    const nextStatus = input.action === "ratify" ? "canon" : "rejected";
    const ratifiedAt = input.action === "ratify" ? timestamp : null;
    const ratifiedBy = input.action === "ratify" ? "steward" : null;
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
        kind: input.action === "ratify" ? "ratified" : "rejected",
        leagueId: input.leagueId,
        reason: `steward:${input.action}`,
      },
    ]);

    if (input.action === "ratify") {
      return {
        claimId: input.claimId,
        ratifiedBy: "steward",
        status: "canonized",
      };
    }

    return {
      claimId: input.claimId,
      status: "rejected",
    };
  });
}
