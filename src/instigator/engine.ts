import { and, desc, eq } from "drizzle-orm";
import {
  type AiGenerationDependencies,
  type AiPersona,
  generateLeagueBlogPost,
  parseAiPersona,
} from "@/ai";
import { AppError } from "@/core/result";
import type { Db } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  instigations,
  loreClaims,
  loreEvents,
  members,
  polls,
  pollVotes,
} from "@/db/schema";

export const INSTIGATION_KINDS = [
  "settle_it_poll",
  "villain_crown",
  "manufactured_rivalry",
  "user_move_reaction",
] as const;

export type InstigationKind = (typeof INSTIGATION_KINDS)[number];

export interface InstigationGroundingRef extends Record<string, unknown> {
  id: string;
  type: "record" | "head_to_head" | "transaction" | "team" | "member";
  label?: string;
}

export interface SeedInstigationInput {
  leagueId: string;
  persona: AiPersona;
  kind: InstigationKind;
  dedupKey: string;
  promptText: string;
  options: string[];
  groundingRefs: InstigationGroundingRef[];
  closesAt?: Date;
}

export interface SeedInstigationResult {
  reused: boolean;
  instigationId: string;
  pollId: string | null;
  contentItemId: string | null;
  status: "open" | "polling" | "resolved" | "skipped";
}

export interface CastPollVoteInput {
  leagueId: string;
  pollId: string;
  memberId: string;
  optionIdx: number;
}

export interface CastPollVoteResult {
  pollId: string;
  memberId: string;
  optionIdx: number;
}

export interface ClosePollInput {
  leagueId: string;
  pollId: string;
}

export type ClosePollResult =
  | {
      status: "canonized";
      reused: boolean;
      pollId: string;
      loreClaimId: string;
      verdictContentItemId: string | null;
      winningOptionIdx: number;
      winningOption: string;
      totalVotes: number;
    }
  | {
      status: "skipped";
      reused: boolean;
      pollId: string;
      reason: "no_votes" | "tie";
      verdictContentItemId: null;
      totalVotes: number;
    };

function now(deps: Pick<AiGenerationDependencies, "now">): Date {
  return deps.now?.() ?? new Date();
}

function defaultClosesAt(base: Date): Date {
  return new Date(base.getTime() + 7 * 24 * 60 * 60 * 1000);
}

function cleanText(value: string, field: string): string {
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) {
    throw new AppError({
      code: "INSTIGATION_INVALID",
      message: `${field} is required`,
      status: 400,
    });
  }
  return text;
}

function cleanOptions(options: readonly string[]): string[] {
  const cleaned: string[] = [];
  const seen = new Set<string>();
  for (const option of options) {
    const text = option.replace(/\s+/g, " ").trim();
    const key = text.toLowerCase();
    if (!text || seen.has(key)) {
      continue;
    }
    seen.add(key);
    cleaned.push(text);
  }
  return cleaned;
}

function isInstigationKind(value: string): value is InstigationKind {
  return (INSTIGATION_KINDS as readonly string[]).includes(value);
}

export function parseInstigationKind(value: string): InstigationKind {
  if (isInstigationKind(value)) {
    return value;
  }
  throw new AppError({
    code: "INSTIGATION_KIND_INVALID",
    message: "Instigation kind is invalid",
    status: 400,
  });
}

function validateGroundingRefs(
  refs: readonly InstigationGroundingRef[],
): InstigationGroundingRef[] {
  const cleaned = refs
    .map((ref) => ({
      id: ref.id.replace(/\s+/g, " ").trim(),
      label: ref.label?.replace(/\s+/g, " ").trim(),
      type: ref.type,
    }))
    .filter((ref) => ref.id.length > 0);

  if (cleaned.length === 0) {
    throw new AppError({
      code: "INSTIGATION_UNGROUNDED",
      message: "Instigations must cite at least one league-owned grounding ref",
      status: 422,
    });
  }

  return cleaned;
}

function validateSeedInput(input: SeedInstigationInput) {
  const kind = parseInstigationKind(input.kind);
  const persona = parseAiPersona(input.persona);
  const dedupKey = cleanText(input.dedupKey, "dedupKey");
  const promptText = cleanText(input.promptText, "promptText");
  const options = cleanOptions(input.options);
  const groundingRefs = validateGroundingRefs(input.groundingRefs);

  if (kind === "settle_it_poll" && options.length < 2) {
    throw new AppError({
      code: "INSTIGATION_OPTIONS_INVALID",
      message: "Settle-it polls require at least two options",
      status: 422,
    });
  }

  return {
    dedupKey,
    groundingRefs,
    kind,
    options,
    persona,
    promptText,
  };
}

async function loadSeededPoll({
  db,
  instigationId,
  leagueId,
}: {
  db: Db;
  instigationId: string;
  leagueId: string;
}) {
  const [poll] = await withLeagueContext(db, leagueId, (tx) =>
    tx
      .select({ id: polls.id })
      .from(polls)
      .where(
        and(
          eq(polls.leagueId, leagueId),
          eq(polls.instigationId, instigationId),
        ),
      )
      .limit(1),
  );

  return poll?.id ?? null;
}

export async function seedInstigation({
  deps,
  input,
}: {
  deps: AiGenerationDependencies;
  input: SeedInstigationInput;
}): Promise<SeedInstigationResult> {
  const validated = validateSeedInput(input);
  const timestamp = now(deps);
  const closesAt = input.closesAt ?? defaultClosesAt(timestamp);

  const seeded = await withLeagueContext(
    deps.db,
    input.leagueId,
    async (tx) => {
      const [inserted] = await tx
        .insert(instigations)
        .values({
          dedupKey: validated.dedupKey,
          groundingRefs: validated.groundingRefs,
          kind: validated.kind,
          leagueId: input.leagueId,
          options: validated.options,
          persona: validated.persona,
          promptText: validated.promptText,
          status: validated.kind === "settle_it_poll" ? "polling" : "open",
        })
        .onConflictDoNothing({
          target: [instigations.leagueId, instigations.dedupKey],
        })
        .returning({
          contentItemId: instigations.contentItemId,
          id: instigations.id,
          status: instigations.status,
        });

      const instigation =
        inserted ??
        (
          await tx
            .select({
              contentItemId: instigations.contentItemId,
              id: instigations.id,
              status: instigations.status,
            })
            .from(instigations)
            .where(
              and(
                eq(instigations.leagueId, input.leagueId),
                eq(instigations.dedupKey, validated.dedupKey),
              ),
            )
            .limit(1)
        )[0];

      if (!instigation) {
        throw new AppError({
          code: "INSTIGATION_SEED_FAILED",
          message: "Instigation could not be seeded",
          status: 500,
        });
      }

      let pollId: string | null = null;
      if (validated.kind === "settle_it_poll") {
        const [insertedPoll] = await tx
          .insert(polls)
          .values({
            closesAt,
            instigationId: instigation.id,
            leagueId: input.leagueId,
            options: validated.options,
            question: validated.promptText,
            status: "open",
          })
          .onConflictDoNothing({
            target: [polls.leagueId, polls.instigationId],
          })
          .returning({ id: polls.id });

        pollId = insertedPoll?.id ?? null;
      }

      return {
        contentItemId: instigation.contentItemId,
        instigationId: instigation.id,
        pollId,
        reused: !inserted,
        status: instigation.status,
      };
    },
  );

  const pollId =
    seeded.pollId ??
    (validated.kind === "settle_it_poll"
      ? await loadSeededPoll({
          db: deps.db,
          instigationId: seeded.instigationId,
          leagueId: input.leagueId,
        })
      : null);

  const column = await generateLeagueBlogPost({
    deps,
    input: {
      contentType: "instigation_column",
      leagueId: input.leagueId,
      persona: validated.persona,
      triggerKey: `instigation:${seeded.instigationId}`,
    },
  });

  const contentItemId =
    column.status === "published" ? column.contentItemId : seeded.contentItemId;

  if (column.status === "published" && contentItemId !== seeded.contentItemId) {
    await withLeagueContext(deps.db, input.leagueId, (tx) =>
      tx
        .update(instigations)
        .set({ contentItemId, updatedAt: now(deps) })
        .where(
          and(
            eq(instigations.leagueId, input.leagueId),
            eq(instigations.id, seeded.instigationId),
          ),
        ),
    );
  }

  return {
    contentItemId,
    instigationId: seeded.instigationId,
    pollId,
    reused: seeded.reused,
    status: seeded.status,
  };
}

export async function castPollVote({
  deps,
  input,
}: {
  deps: Pick<AiGenerationDependencies, "db" | "now">;
  input: CastPollVoteInput;
}): Promise<CastPollVoteResult> {
  if (!Number.isInteger(input.optionIdx) || input.optionIdx < 0) {
    throw new AppError({
      code: "POLL_OPTION_INVALID",
      message: "Poll option index is invalid",
      status: 400,
    });
  }

  const timestamp = now(deps);
  return withLeagueContext(deps.db, input.leagueId, async (tx) => {
    const [poll] = await tx
      .select({
        options: polls.options,
        status: polls.status,
      })
      .from(polls)
      .where(
        and(eq(polls.leagueId, input.leagueId), eq(polls.id, input.pollId)),
      )
      .limit(1);

    if (!poll) {
      throw new AppError({
        code: "POLL_NOT_FOUND",
        message: "Poll could not be found",
        status: 404,
      });
    }

    if (poll.status !== "open") {
      throw new AppError({
        code: "POLL_CLOSED",
        message: "Poll is already closed",
        status: 409,
      });
    }

    if (input.optionIdx >= poll.options.length) {
      throw new AppError({
        code: "POLL_OPTION_INVALID",
        message: "Poll option index is invalid",
        status: 400,
      });
    }

    const [member] = await tx
      .select({ id: members.id })
      .from(members)
      .where(
        and(
          eq(members.id, input.memberId),
          eq(members.organizationId, input.leagueId),
        ),
      )
      .limit(1);

    if (!member) {
      throw new AppError({
        code: "POLL_MEMBER_NOT_FOUND",
        message: "Poll votes require a member of the league",
        status: 403,
      });
    }

    const [vote] = await tx
      .insert(pollVotes)
      .values({
        leagueId: input.leagueId,
        memberId: input.memberId,
        optionIdx: input.optionIdx,
        pollId: input.pollId,
        updatedAt: timestamp,
      })
      .onConflictDoUpdate({
        set: {
          optionIdx: input.optionIdx,
          updatedAt: timestamp,
        },
        target: [pollVotes.leagueId, pollVotes.pollId, pollVotes.memberId],
      })
      .returning({
        memberId: pollVotes.memberId,
        optionIdx: pollVotes.optionIdx,
        pollId: pollVotes.pollId,
      });

    if (!vote) {
      throw new AppError({
        code: "POLL_VOTE_FAILED",
        message: "Poll vote could not be recorded",
        status: 500,
      });
    }

    return vote;
  });
}

function tallyVotes({
  optionCount,
  votes,
}: {
  optionCount: number;
  votes: readonly { optionIdx: number }[];
}) {
  const counts = Array.from({ length: optionCount }, () => 0);
  for (const vote of votes) {
    if (vote.optionIdx >= 0 && vote.optionIdx < optionCount) {
      counts[vote.optionIdx] += 1;
    }
  }
  const max = Math.max(...counts);
  const winningIndexes = counts
    .map((count, index) => ({ count, index }))
    .filter((entry) => entry.count === max);
  return { counts, max, winningIndexes };
}

export async function closePoll({
  deps,
  input,
}: {
  deps: AiGenerationDependencies;
  input: ClosePollInput;
}): Promise<ClosePollResult> {
  const timestamp = now(deps);
  const closed = await withLeagueContext(
    deps.db,
    input.leagueId,
    async (tx) => {
      const [poll] = await tx
        .select({
          closedAt: polls.closedAt,
          id: polls.id,
          instigationId: polls.instigationId,
          options: polls.options,
          question: polls.question,
          status: polls.status,
          winningOptionIdx: polls.winningOptionIdx,
        })
        .from(polls)
        .where(
          and(eq(polls.leagueId, input.leagueId), eq(polls.id, input.pollId)),
        )
        .limit(1);

      if (!poll) {
        throw new AppError({
          code: "POLL_NOT_FOUND",
          message: "Poll could not be found",
          status: 404,
        });
      }

      if (poll.status === "closed") {
        const [existingClaim] = await tx
          .select({
            id: loreClaims.id,
            statement: loreClaims.statement,
          })
          .from(loreClaims)
          .where(
            and(
              eq(loreClaims.leagueId, input.leagueId),
              eq(loreClaims.sourcePollId, input.pollId),
            ),
          )
          .limit(1);

        if (existingClaim && poll.winningOptionIdx !== null) {
          return {
            kind: "canonized" as const,
            loreClaimId: existingClaim.id,
            reused: true,
            totalVotes: 0,
            winningOption: poll.options[poll.winningOptionIdx] ?? "",
            winningOptionIdx: poll.winningOptionIdx,
          };
        }

        return {
          kind: "skipped" as const,
          reason: "no_votes" as const,
          reused: true,
          totalVotes: 0,
        };
      }

      const [instigation] = await tx
        .select({
          groundingRefs: instigations.groundingRefs,
          persona: instigations.persona,
        })
        .from(instigations)
        .where(
          and(
            eq(instigations.leagueId, input.leagueId),
            eq(instigations.id, poll.instigationId),
          ),
        )
        .limit(1);

      if (!instigation) {
        throw new AppError({
          code: "INSTIGATION_NOT_FOUND",
          message: "Instigation could not be found for poll",
          status: 404,
        });
      }

      const votes = await tx
        .select({ optionIdx: pollVotes.optionIdx })
        .from(pollVotes)
        .where(
          and(
            eq(pollVotes.leagueId, input.leagueId),
            eq(pollVotes.pollId, poll.id),
          ),
        )
        .orderBy(desc(pollVotes.updatedAt));

      if (votes.length === 0) {
        const result = {
          reason: "no_votes",
          totalVotes: 0,
        };
        await tx
          .update(polls)
          .set({
            closedAt: timestamp,
            result,
            status: "closed",
            updatedAt: timestamp,
          })
          .where(
            and(eq(polls.leagueId, input.leagueId), eq(polls.id, poll.id)),
          );
        await tx
          .update(instigations)
          .set({
            resolution: result,
            status: "skipped",
            updatedAt: timestamp,
          })
          .where(
            and(
              eq(instigations.leagueId, input.leagueId),
              eq(instigations.id, poll.instigationId),
            ),
          );
        return {
          kind: "skipped" as const,
          reason: "no_votes" as const,
          reused: false,
          totalVotes: votes.length,
        };
      }

      const tally = tallyVotes({ optionCount: poll.options.length, votes });
      if (tally.winningIndexes.length !== 1) {
        const result = {
          counts: tally.counts,
          reason: "tie",
          totalVotes: votes.length,
        };
        await tx
          .update(polls)
          .set({
            closedAt: timestamp,
            result,
            status: "closed",
            updatedAt: timestamp,
          })
          .where(
            and(eq(polls.leagueId, input.leagueId), eq(polls.id, poll.id)),
          );
        await tx
          .update(instigations)
          .set({
            resolution: result,
            status: "skipped",
            updatedAt: timestamp,
          })
          .where(
            and(
              eq(instigations.leagueId, input.leagueId),
              eq(instigations.id, poll.instigationId),
            ),
          );
        return {
          kind: "skipped" as const,
          reason: "tie" as const,
          reused: false,
          totalVotes: votes.length,
        };
      }

      const winningOptionIdx = tally.winningIndexes[0]?.index ?? 0;
      const winningOption = poll.options[winningOptionIdx] ?? "";
      const result = {
        counts: tally.counts,
        totalVotes: votes.length,
        winningOption,
        winningOptionIdx,
      };
      const statement = `The league voted "${winningOption}" on "${poll.question}".`;

      const [claim] = await tx
        .insert(loreClaims)
        .values({
          authorPersona: instigation.persona,
          evidenceRefs: [
            ...instigation.groundingRefs,
            {
              id: poll.id,
              label: poll.question,
              type: "poll",
            },
          ],
          kind: "opinion",
          leagueId: input.leagueId,
          origin: "ai",
          ratifiedAt: timestamp,
          ratifiedBy: "vote",
          sourceInstigationId: poll.instigationId,
          sourcePollId: poll.id,
          statement,
          status: "canon",
          title: poll.question,
        })
        .onConflictDoNothing({
          target: [loreClaims.leagueId, loreClaims.sourcePollId],
        })
        .returning({
          id: loreClaims.id,
          statement: loreClaims.statement,
        });

      const loreClaim =
        claim ??
        (
          await tx
            .select({
              id: loreClaims.id,
              statement: loreClaims.statement,
            })
            .from(loreClaims)
            .where(
              and(
                eq(loreClaims.leagueId, input.leagueId),
                eq(loreClaims.sourcePollId, poll.id),
              ),
            )
            .limit(1)
        )[0];

      if (!loreClaim) {
        throw new AppError({
          code: "LORE_CLAIM_FAILED",
          message: "Lore claim could not be created for the poll result",
          status: 500,
        });
      }

      if (claim) {
        await tx.insert(loreEvents).values([
          {
            afterState: {
              origin: "ai",
              sourcePollId: poll.id,
              status: "canon",
            },
            claimId: loreClaim.id,
            kind: "created",
            leagueId: input.leagueId,
            reason: "poll_closed",
          },
          {
            afterState: {
              ratifiedBy: "vote",
              result,
              statement,
              status: "canon",
            },
            claimId: loreClaim.id,
            kind: "ratified",
            leagueId: input.leagueId,
            reason: "poll_closed",
          },
        ]);
      }

      await tx
        .update(polls)
        .set({
          closedAt: timestamp,
          result,
          status: "closed",
          updatedAt: timestamp,
          winningOptionIdx,
        })
        .where(and(eq(polls.leagueId, input.leagueId), eq(polls.id, poll.id)));
      await tx
        .update(instigations)
        .set({
          resolution: {
            loreClaimId: loreClaim.id,
            ...result,
          },
          status: "resolved",
          updatedAt: timestamp,
        })
        .where(
          and(
            eq(instigations.leagueId, input.leagueId),
            eq(instigations.id, poll.instigationId),
          ),
        );

      return {
        kind: "canonized" as const,
        loreClaimId: loreClaim.id,
        reused: !claim,
        totalVotes: votes.length,
        winningOption,
        winningOptionIdx,
      };
    },
  );

  if (closed.kind === "skipped") {
    return {
      pollId: input.pollId,
      reused: closed.reused,
      reason: closed.reason,
      status: "skipped",
      totalVotes: closed.totalVotes,
      verdictContentItemId: null,
    };
  }

  const verdict = await generateLeagueBlogPost({
    deps,
    input: {
      contentType: "verdict_column",
      leagueId: input.leagueId,
      persona: "commissioner",
      triggerKey: `poll-closed:${input.pollId}`,
    },
  });

  return {
    loreClaimId: closed.loreClaimId,
    pollId: input.pollId,
    reused: closed.reused,
    status: "canonized",
    totalVotes: closed.totalVotes,
    verdictContentItemId:
      verdict.status === "published" ? verdict.contentItemId : null,
    winningOption: closed.winningOption,
    winningOptionIdx: closed.winningOptionIdx,
  };
}
