import { and, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import { loreVerifications } from "@/db/schema";
import { submitLoreClaim } from "@/lore";
import type { RealtimePublisher } from "@/realtime";
import type { RecordBrokenHook } from "./engine";

export interface RecordBrokenLoreHookResult {
  allTimeRecordId: string;
  claimId: string;
  status: "canonized" | "rejected" | "vote";
  verification: "verified" | "refuted" | "unverifiable" | "n_a";
}

function titleForRecordType(recordType: string): string {
  return `Record book update: ${recordType.replaceAll("_", " ")}`;
}

function bodyForHook(hook: RecordBrokenHook): string {
  const week = hook.scoringPeriod ? ` Week ${hook.scoringPeriod}` : "";
  const season = hook.season ? ` in ${hook.season}` : "";
  return `${hook.recordType.replaceAll("_", " ")} is now ${hook.value}${season}${week}.`;
}

async function hasRecordLoreVerification({
  db,
  hook,
  leagueId,
}: {
  db: Db;
  hook: RecordBrokenHook;
  leagueId: string;
}): Promise<boolean> {
  return withLeagueContext(db, leagueId, async (tx) => {
    const [existing] = await tx
      .select({ claimId: loreVerifications.claimId })
      .from(loreVerifications)
      .where(
        and(
          eq(loreVerifications.leagueId, leagueId),
          eq(loreVerifications.allTimeRecordId, hook.allTimeRecordId),
        ),
      )
      .limit(1);

    return Boolean(existing);
  });
}

export async function seedRecordBrokenLoreHooks({
  db,
  hooks,
  leagueId,
  now,
  realtime,
}: {
  db: Db;
  hooks: readonly RecordBrokenHook[];
  leagueId: string;
  now?: () => Date;
  realtime?: RealtimePublisher;
}): Promise<RecordBrokenLoreHookResult[]> {
  const seeded: RecordBrokenLoreHookResult[] = [];
  for (const hook of hooks) {
    if (!hook.holderPersonId) {
      continue;
    }
    if (await hasRecordLoreVerification({ db, hook, leagueId })) {
      continue;
    }

    const result = await submitLoreClaim({
      deps: { db, now, realtime },
      input: {
        assertions: [
          {
            assertedValue: hook.value,
            holderPersonId: hook.holderPersonId,
            recordType: hook.recordType,
            ...(hook.scoringPeriod
              ? { scoringPeriod: hook.scoringPeriod }
              : {}),
            ...(hook.season ? { season: hook.season } : {}),
            source: "all_time_record",
          },
        ],
        authorPersona: "narrator",
        body: bodyForHook(hook),
        leagueId,
        origin: "ai",
        subjects: [
          {
            allTimeRecordId: hook.allTimeRecordId,
            metadata: {
              previousRecordId: hook.previousRecordId,
              source: "record_broken_hook",
            },
            personId: hook.holderPersonId,
            recordType: hook.recordType,
            season: hook.season,
            subjectType: "record",
            week: hook.scoringPeriod,
          },
        ],
        title: titleForRecordType(hook.recordType),
      },
    });

    seeded.push({
      allTimeRecordId: hook.allTimeRecordId,
      claimId: result.claimId,
      status: result.status,
      verification: result.verification,
    });
  }

  return seeded;
}
