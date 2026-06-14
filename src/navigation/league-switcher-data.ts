import { and, eq, inArray } from "drizzle-orm";
import { type LeagueRole, listLeagueMembershipsForUser } from "@/auth/guards";
import type { AppError } from "@/core/result";
import { err, ok, type Result } from "@/core/result";
import type { Db } from "@/db/client";
import { leagues, members } from "@/db/schema";
import {
  type LeagueSwitcherItem,
  sortLeagueSwitcherItems,
} from "./league-switcher-model";
import { getProviderBadgeLabel } from "./scope";

export interface ListLeagueSwitcherItemsInput {
  readonly leagueIds?: readonly string[];
  readonly minRole?: LeagueRole;
  readonly userId: string;
}

export interface MarkLeagueOpenedInput {
  readonly leagueId: string;
  readonly openedAt?: Date;
  readonly userId: string;
}

export interface MarkLeagueOpenedResult {
  readonly lastOpenedAt: Date;
  readonly leagueId: string;
}

export async function listLeagueSwitcherItemsForUser(
  db: Db,
  input: ListLeagueSwitcherItemsInput,
): Promise<Result<LeagueSwitcherItem[], AppError>> {
  const memberships = await listLeagueMembershipsForUser(db, input);
  if (!memberships.ok) {
    return err(memberships.error);
  }

  if (memberships.value.length === 0) {
    return ok([]);
  }

  const roleByLeagueId = new Map(
    memberships.value.map((membership) => [
      membership.leagueId,
      membership.role,
    ]),
  );
  const leagueIds = memberships.value.map((membership) => membership.leagueId);

  const rows = await db
    .select({
      lastOpenedAt: members.lastOpenedAt,
      leagueId: leagues.id,
      logo: leagues.logo,
      name: leagues.name,
      provider: leagues.provider,
    })
    .from(members)
    .innerJoin(leagues, eq(leagues.id, members.organizationId))
    .where(
      and(
        eq(members.userId, input.userId),
        inArray(members.organizationId, leagueIds),
      ),
    );

  const items = rows.map((row) => ({
    lastOpenedAt: row.lastOpenedAt,
    leagueId: row.leagueId,
    logo: row.logo,
    name: row.name,
    provider: row.provider,
    providerLabel: getProviderBadgeLabel(row.provider),
    role: roleByLeagueId.get(row.leagueId) ?? "member",
  }));

  return ok(sortLeagueSwitcherItems(items));
}

export async function markLeagueOpened(
  db: Db,
  input: MarkLeagueOpenedInput,
): Promise<Result<MarkLeagueOpenedResult, AppError>> {
  const memberships = await listLeagueMembershipsForUser(db, {
    leagueIds: [input.leagueId],
    minRole: "member",
    userId: input.userId,
  });
  if (!memberships.ok) {
    return err(memberships.error);
  }

  const openedAt = input.openedAt ?? new Date();
  await db
    .update(members)
    .set({ lastOpenedAt: openedAt })
    .where(
      and(
        eq(members.organizationId, input.leagueId),
        eq(members.userId, input.userId),
      ),
    );

  return ok({ lastOpenedAt: openedAt, leagueId: input.leagueId });
}
