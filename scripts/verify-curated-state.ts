import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { and, asc, eq } from "drizzle-orm";

type EnvMap = Record<string, string | undefined>;

function loadEnvLocal(env: EnvMap): void {
  const path = resolve(process.cwd(), ".env.local");
  let body: string;
  try {
    body = readFileSync(path, "utf8");
  } catch (error) {
    throw new Error("Missing .env.local", { cause: error });
  }

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (!match) {
      continue;
    }
    const [, key, rawValue] = match;
    if (env[key] !== undefined) {
      continue;
    }
    env[key] = rawValue
      .trim()
      .replace(/^(['"])(.*)\1$/, "$2")
      .replace(/\\n/g, "\n");
  }
}

function requireCondition(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function sameValue(left: unknown, right: unknown): boolean {
  return Object.is(left, right);
}

loadEnvLocal(process.env);

async function main(): Promise<void> {
  const { parseEnv } = await import("../src/core/env/schema");
  const { createDb } = await import("../src/db/client");
  const { withLeagueContext } = await import("../src/db/rls");
  const { migrateSerialized } = await import("../src/db/test-support");
  const { leagues, teamSeasons, users } = await import("../src/db/schema");
  const {
    applyCuratedDataEdit,
    composeCanonicalSnapshot,
    createCurationCheckpoint,
    pushAllCurationSeasons,
    pushCurationSeason,
    restoreCurationCheckpoint,
  } = await import("../src/stats");

  const env = parseEnv(process.env);
  const providerLeagueId = String(env.espn.testLeagueId ?? 95050);
  const handle = createDb(env.databaseUrl);

  try {
    await migrateSerialized(handle);
    const [league] = await handle.db
      .select({ id: leagues.id, name: leagues.name })
      .from(leagues)
      .where(
        and(
          eq(leagues.provider, "espn"),
          eq(leagues.providerLeagueId, providerLeagueId),
        ),
      )
      .limit(1);
    if (!league) {
      throw new Error(
        `Imported ESPN league ${providerLeagueId} was not found. Run scripts/import-real-league.ts first.`,
      );
    }

    const [actor] = await handle.db
      .insert(users)
      .values({
        displayName: "T4 Curated State Verifier",
        email: `t4-curated-state-${Date.now()}@example.com`,
      })
      .returning({ id: users.id });
    if (!actor) {
      throw new Error("verification actor was not created");
    }

    const target = await withLeagueContext(handle.db, league.id, async (tx) => {
      const rows = await tx
        .select({
          id: teamSeasons.id,
          providerTeamId: teamSeasons.providerTeamId,
          season: teamSeasons.season,
          teamName: teamSeasons.teamName,
        })
        .from(teamSeasons)
        .where(eq(teamSeasons.leagueId, league.id))
        .orderBy(asc(teamSeasons.season), asc(teamSeasons.providerTeamId));
      const seasons = [...new Set(rows.map((row) => row.season))].sort(
        (left, right) => left - right,
      );
      return {
        seasons,
        team2011: rows.find((row) => row.season === 2011),
        team2012: rows.find((row) => row.season === 2012),
      };
    });

    requireCondition(
      Boolean(target.team2011 && target.team2012),
      "verification requires imported 2011 and 2012 team-season rows",
    );
    const team2011 = target.team2011;
    const team2012 = target.team2012;
    if (!team2011 || !team2012) {
      throw new Error("verification target rows disappeared");
    }

    const baseline = await createCurationCheckpoint(handle.db, {
      actorUserId: actor.id,
      label: "T4 verification baseline",
      leagueId: league.id,
      note: "baseline before T4 real-data verification",
    });
    await pushAllCurationSeasons(handle.db, {
      actorUserId: actor.id,
      checkpointId: baseline.id,
      leagueId: league.id,
      reason: "T4 verification baseline push all",
    });

    const beforeEdit = await composeCanonicalSnapshot(handle.db, {
      leagueId: league.id,
    });
    requireCondition(
      target.seasons.every((season) => beforeEdit.seasons.includes(season)),
      "baseline pushAll did not account for every imported season",
    );
    const baseline2012Name = beforeEdit.teamSeasons.find(
      (row) => row.snapshotSeason === 2012 && row.id === team2012.id,
    )?.teamName;
    requireCondition(
      sameValue(baseline2012Name, team2012.teamName),
      "baseline canonical snapshot did not capture the 2012 team name",
    );

    const editedName = `${team2012.teamName} T4 VERIFY`;
    await applyCuratedDataEdit(handle.db, {
      actorUserId: actor.id,
      editClass: "cosmetic",
      field: "team_name",
      leagueId: league.id,
      reason: "T4 real-data save/push verification",
      scope: "this_year_only",
      targetId: team2012.id,
      targetKind: "team_season",
      value: editedName,
    });
    const editedCheckpoint = await createCurationCheckpoint(handle.db, {
      actorUserId: actor.id,
      label: "T4 verification edited 2012",
      leagueId: league.id,
      note: "2012 team-name edit saved but not pushed yet",
    });

    const savedNotPushed = await composeCanonicalSnapshot(handle.db, {
      leagueId: league.id,
    });
    const savedNotPushed2012Name = savedNotPushed.teamSeasons.find(
      (row) => row.snapshotSeason === 2012 && row.id === team2012.id,
    )?.teamName;
    requireCondition(
      sameValue(savedNotPushed2012Name, team2012.teamName),
      "saved 2012 edit became canonical before push",
    );
    requireCondition(
      savedNotPushed.seasons.includes(2011),
      "2011 fell out of canonical composition before 2012 push",
    );

    await pushCurationSeason(handle.db, {
      actorUserId: actor.id,
      checkpointId: editedCheckpoint.id,
      leagueId: league.id,
      reason: "T4 verification push 2012 only",
      season: 2012,
    });
    const afterPush = await composeCanonicalSnapshot(handle.db, {
      leagueId: league.id,
    });
    const afterPush2012Name = afterPush.teamSeasons.find(
      (row) => row.snapshotSeason === 2012 && row.id === team2012.id,
    )?.teamName;
    requireCondition(
      sameValue(afterPush2012Name, editedName),
      "pushed 2012 edit was not visible in canonical composition",
    );
    requireCondition(
      target.seasons.every((season) => afterPush.seasons.includes(season)),
      "pushing 2012 orphaned a previously pushed season",
    );

    await restoreCurationCheckpoint(handle.db, {
      actorUserId: actor.id,
      checkpointId: baseline.id,
      leagueId: league.id,
      reason: "restore baseline after T4 verification",
    });
    await pushAllCurationSeasons(handle.db, {
      actorUserId: actor.id,
      checkpointId: baseline.id,
      leagueId: league.id,
      reason: "restore canonical baseline after T4 verification",
    });

    console.log(
      [
        "T4 curated-state verification PASS",
        `league=${league.name}`,
        `seasons_accounted=${afterPush.seasons.length}`,
        "saved_edit_visible_before_push=false",
        "pushed_2012_preserved_other_seasons=true",
      ].join("\n"),
    );
  } finally {
    await handle.pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
