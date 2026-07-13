import { and, desc, eq, sql } from "drizzle-orm";
import { AppError, err, ok, type Result, toAppError } from "@/core/result";
import type { Db } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  dataCorrectionAuditLog,
  dataIntegrityChecks,
  identityAuditLog,
  identityMappings,
  persons,
  providerPayloadObservations,
  teamSeasons,
} from "@/db/schema";
import { recomputeLeagueStatistics, runDataIntegrityChecks } from "./engine";

export interface DataIntegrityReviewItem {
  checkKey: string;
  createdAt: string;
  detail: Record<string, unknown>;
  id: string;
  reviewedAt: string | null;
  reviewedByUserId: string | null;
  season: number | null;
  status: "pass" | "fail" | "reviewed";
}

export interface SuggestedIdentityLink {
  confidence: number;
  mappingId: string;
  personId: string;
  providerTeamId: string;
  season: number;
  teamSeasonId: string;
}

export interface ProviderPayloadDriftAlert {
  addedPaths: string[];
  contentHash: string;
  detail: Record<string, unknown>;
  driftKinds: Array<"shape_additive" | "shape_changed" | "semantic">;
  id: string;
  observedAt: string;
  previousObservationId: string | null;
  provider: "espn" | "sleeper" | "yahoo";
  providerLeagueId: string;
  removedPaths: string[];
  schemaHash: string;
  scoringPeriod: number | null;
  season: number;
  view: "settings" | "scoreboard";
}

export interface DataStewardReviewSummary {
  integrityChecks: DataIntegrityReviewItem[];
  payloadDriftAlerts: ProviderPayloadDriftAlert[];
  suggestedIdentityLinks: SuggestedIdentityLink[];
}

function stewardError({
  code,
  message,
  status,
}: {
  code: string;
  message: string;
  status: number;
}): AppError {
  return new AppError({ code, message, status });
}

function invalidCorrectionError(message: string): AppError {
  return stewardError({
    code: "INVALID_STEWARD_CORRECTION",
    message,
    status: 400,
  });
}

export async function listDataStewardReview(
  db: Db,
  input: { leagueId: string; limit?: number },
): Promise<Result<DataStewardReviewSummary, AppError>> {
  try {
    const limit = Math.max(1, Math.min(100, input.limit ?? 50));
    const summary = await withLeagueContext(db, input.leagueId, async (tx) => {
      const checkRows = await tx
        .select({
          checkKey: dataIntegrityChecks.checkKey,
          createdAt: dataIntegrityChecks.createdAt,
          detail: dataIntegrityChecks.detail,
          id: dataIntegrityChecks.id,
          reviewedAt: dataIntegrityChecks.reviewedAt,
          reviewedByUserId: dataIntegrityChecks.reviewedByUserId,
          season: dataIntegrityChecks.season,
          status: dataIntegrityChecks.status,
        })
        .from(dataIntegrityChecks)
        .where(eq(dataIntegrityChecks.leagueId, input.leagueId))
        .orderBy(desc(dataIntegrityChecks.createdAt))
        .limit(limit);

      const suggestedRows = await tx
        .select({
          confidence: identityMappings.confidence,
          mappingId: identityMappings.id,
          personId: identityMappings.personId,
          providerTeamId: identityMappings.providerTeamId,
          season: identityMappings.season,
          teamSeasonId: identityMappings.teamSeasonId,
        })
        .from(identityMappings)
        .where(
          and(
            eq(identityMappings.leagueId, input.leagueId),
            eq(identityMappings.method, "fuzzy"),
            sql`${identityMappings.confidence} >= 0.6`,
            sql`${identityMappings.confidence} < 0.85`,
          ),
        )
        .orderBy(desc(identityMappings.confidence))
        .limit(limit);

      const payloadRows = await tx
        .select({
          addedPaths: providerPayloadObservations.addedPaths,
          contentHash: providerPayloadObservations.contentHash,
          detail: providerPayloadObservations.detail,
          driftKinds: providerPayloadObservations.driftKinds,
          id: providerPayloadObservations.id,
          observedAt: providerPayloadObservations.observedAt,
          outcome: providerPayloadObservations.outcome,
          previousObservationId:
            providerPayloadObservations.previousObservationId,
          provider: providerPayloadObservations.provider,
          providerLeagueId: providerPayloadObservations.providerLeagueId,
          removedPaths: providerPayloadObservations.removedPaths,
          schemaHash: providerPayloadObservations.schemaHash,
          scoringPeriod: providerPayloadObservations.scoringPeriod,
          season: providerPayloadObservations.season,
          view: providerPayloadObservations.view,
        })
        .from(providerPayloadObservations)
        .where(eq(providerPayloadObservations.leagueId, input.leagueId))
        .orderBy(
          desc(providerPayloadObservations.observedAt),
          desc(providerPayloadObservations.createdAt),
          desc(providerPayloadObservations.id),
        )
        .limit(Math.min(1000, limit * 20));

      const latestPayloadRows = new Map<string, (typeof payloadRows)[number]>();
      for (const row of payloadRows) {
        const key = [
          row.provider,
          row.providerLeagueId,
          row.season,
          row.view,
          row.scoringPeriod ?? "settings",
        ].join(":");
        if (!latestPayloadRows.has(key)) {
          latestPayloadRows.set(key, row);
        }
      }

      return {
        integrityChecks: checkRows.map((row) => ({
          ...row,
          createdAt: row.createdAt.toISOString(),
          reviewedAt: row.reviewedAt?.toISOString() ?? null,
        })),
        payloadDriftAlerts: [...latestPayloadRows.values()]
          .filter((row) => row.outcome === "alert")
          .slice(0, limit)
          .map(({ outcome: _outcome, ...row }) => ({
            ...row,
            observedAt: row.observedAt.toISOString(),
          })),
        suggestedIdentityLinks: suggestedRows,
      };
    });
    return ok(summary);
  } catch (error) {
    return err(
      toAppError(error, {
        code: "STEWARD_REVIEW_LOAD_FAILED",
        message: "Data steward review state could not be loaded",
      }),
    );
  }
}

export async function markIntegrityCheckReviewed(
  db: Db,
  input: {
    actorUserId: string;
    checkId: string;
    leagueId: string;
    reason?: string;
  },
): Promise<Result<DataIntegrityReviewItem, AppError>> {
  try {
    const reviewed = await withLeagueContext(db, input.leagueId, async (tx) => {
      const [before] = await tx
        .select()
        .from(dataIntegrityChecks)
        .where(
          and(
            eq(dataIntegrityChecks.leagueId, input.leagueId),
            eq(dataIntegrityChecks.id, input.checkId),
          ),
        )
        .limit(1);
      if (!before) {
        throw stewardError({
          code: "INTEGRITY_CHECK_NOT_FOUND",
          message: "Integrity check was not found for this league",
          status: 404,
        });
      }

      const [after] = await tx
        .update(dataIntegrityChecks)
        .set({
          reviewedAt: new Date(),
          reviewedByUserId: input.actorUserId,
          status: "reviewed",
          updatedAt: new Date(),
        })
        .where(eq(dataIntegrityChecks.id, before.id))
        .returning();
      if (!after) {
        throw new Error("integrity check review was not persisted");
      }

      await tx.insert(dataCorrectionAuditLog).values({
        action: "mark_reviewed",
        actorUserId: input.actorUserId,
        afterState: {
          reviewedAt: after.reviewedAt?.toISOString() ?? null,
          reviewedByUserId: after.reviewedByUserId,
          status: after.status,
        },
        beforeState: {
          detail: before.detail,
          status: before.status,
        },
        integrityCheckId: before.id,
        leagueId: input.leagueId,
        reason: input.reason ?? "steward accepted integrity flag",
      });

      return after;
    });

    return ok({
      checkKey: reviewed.checkKey,
      createdAt: reviewed.createdAt.toISOString(),
      detail: reviewed.detail,
      id: reviewed.id,
      reviewedAt: reviewed.reviewedAt?.toISOString() ?? null,
      reviewedByUserId: reviewed.reviewedByUserId,
      season: reviewed.season,
      status: reviewed.status,
    });
  } catch (error) {
    return err(
      toAppError(error, {
        code: "INTEGRITY_CHECK_REVIEW_FAILED",
        message: "Integrity check could not be marked reviewed",
      }),
    );
  }
}

export async function rerunDataIntegrityReview(
  db: Db,
  input: { actorUserId: string; leagueId: string; reason?: string },
): Promise<Result<{ checks: number; failures: number }, AppError>> {
  try {
    const result = await runDataIntegrityChecks(db, {
      leagueId: input.leagueId,
    });
    await withLeagueContext(db, input.leagueId, (tx) =>
      tx.insert(dataCorrectionAuditLog).values({
        action: "rerun_integrity",
        actorUserId: input.actorUserId,
        afterState: result,
        beforeState: null,
        leagueId: input.leagueId,
        reason: input.reason ?? "steward reran integrity checks",
      }),
    );
    return ok(result);
  } catch (error) {
    return err(
      toAppError(error, {
        code: "INTEGRITY_RERUN_FAILED",
        message: "Integrity checks could not be rerun",
      }),
    );
  }
}

export async function renamePerson(
  db: Db,
  input: {
    actorUserId: string;
    canonicalName: string;
    leagueId: string;
    personId: string;
    reason?: string;
  },
): Promise<Result<{ personId: string }, AppError>> {
  const canonicalName = input.canonicalName.trim();
  if (!canonicalName) {
    return err(invalidCorrectionError("Canonical name is required"));
  }

  try {
    await withLeagueContext(db, input.leagueId, async (tx) => {
      const [before] = await tx
        .select()
        .from(persons)
        .where(
          and(
            eq(persons.leagueId, input.leagueId),
            eq(persons.id, input.personId),
          ),
        )
        .limit(1);
      if (!before) {
        throw stewardError({
          code: "PERSON_NOT_FOUND",
          message: "Person identity was not found for this league",
          status: 404,
        });
      }

      await tx
        .update(persons)
        .set({ canonicalName, updatedAt: new Date() })
        .where(eq(persons.id, before.id));
      await tx.insert(identityAuditLog).values({
        action: "rename",
        actorUserId: input.actorUserId,
        afterState: { canonicalName },
        beforeState: { canonicalName: before.canonicalName },
        leagueId: input.leagueId,
        personId: before.id,
        reason: input.reason ?? "steward renamed person",
      });
    });
    await recomputeLeagueStatistics(db, { leagueId: input.leagueId });
    return ok({ personId: input.personId });
  } catch (error) {
    return err(
      toAppError(error, {
        code: "PERSON_RENAME_FAILED",
        message: "Person identity could not be renamed",
      }),
    );
  }
}

export async function reassignTeamSeason(
  db: Db,
  input: {
    actorUserId: string;
    leagueId: string;
    newCanonicalName?: string;
    reason?: string;
    targetPersonId?: string;
    teamSeasonId: string;
  },
): Promise<Result<{ personId: string; teamSeasonId: string }, AppError>> {
  const newCanonicalName = input.newCanonicalName?.trim();
  if (Boolean(input.targetPersonId) === Boolean(newCanonicalName)) {
    return err(
      invalidCorrectionError(
        "Provide exactly one target person id or new canonical name",
      ),
    );
  }

  try {
    let assignedPersonId = input.targetPersonId ?? "";
    await withLeagueContext(db, input.leagueId, async (tx) => {
      const [mapping] = await tx
        .select()
        .from(identityMappings)
        .where(
          and(
            eq(identityMappings.leagueId, input.leagueId),
            eq(identityMappings.teamSeasonId, input.teamSeasonId),
          ),
        )
        .limit(1);
      if (!mapping) {
        throw stewardError({
          code: "TEAM_SEASON_MAPPING_NOT_FOUND",
          message: "Team-season mapping was not found for this league",
          status: 404,
        });
      }

      const [teamSeason] = await tx
        .select()
        .from(teamSeasons)
        .where(
          and(
            eq(teamSeasons.leagueId, input.leagueId),
            eq(teamSeasons.id, input.teamSeasonId),
          ),
        )
        .limit(1);
      if (!teamSeason) {
        throw stewardError({
          code: "TEAM_SEASON_NOT_FOUND",
          message: "Team-season was not found for this league",
          status: 404,
        });
      }

      if (newCanonicalName) {
        const [created] = await tx
          .insert(persons)
          .values({
            canonicalName: newCanonicalName,
            leagueId: input.leagueId,
          })
          .returning({ id: persons.id });
        if (!created) {
          throw new Error("target person was not created");
        }
        assignedPersonId = created.id;
      } else if (input.targetPersonId) {
        const [target] = await tx
          .select({ id: persons.id })
          .from(persons)
          .where(
            and(
              eq(persons.leagueId, input.leagueId),
              eq(persons.id, input.targetPersonId),
            ),
          )
          .limit(1);
        if (!target) {
          throw stewardError({
            code: "TARGET_PERSON_NOT_FOUND",
            message: "Target person was not found for this league",
            status: 404,
          });
        }
        assignedPersonId = target.id;
      }

      await tx
        .update(identityMappings)
        .set({
          confidence: 1,
          method: "manual",
          personId: assignedPersonId,
          resolvedBy: input.actorUserId,
          updatedAt: new Date(),
        })
        .where(eq(identityMappings.id, mapping.id));
      await tx.insert(identityAuditLog).values({
        action: "remap",
        actorUserId: input.actorUserId,
        afterState: {
          personId: assignedPersonId,
          teamSeasonId: input.teamSeasonId,
        },
        beforeState: {
          personId: mapping.personId,
          teamSeasonId: input.teamSeasonId,
        },
        leagueId: input.leagueId,
        personId: assignedPersonId,
        reason: input.reason ?? "steward reassigned team-season",
        teamSeasonId: input.teamSeasonId,
      });
    });

    await recomputeLeagueStatistics(db, { leagueId: input.leagueId });
    return ok({
      personId: assignedPersonId,
      teamSeasonId: input.teamSeasonId,
    });
  } catch (error) {
    return err(
      toAppError(error, {
        code: "TEAM_SEASON_REASSIGN_FAILED",
        message: "Team-season could not be reassigned",
      }),
    );
  }
}
