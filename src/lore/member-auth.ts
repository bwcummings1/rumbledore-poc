import { and, eq } from "drizzle-orm";
import type { LeagueRoleAccess } from "@/auth/guards";
import { AppError } from "@/core/result";
import type { Db } from "@/db/client";
import { members } from "@/db/schema";

export async function getLoreMemberIdForUser(
  db: Db,
  input: { leagueId: string; userId: string },
): Promise<string> {
  const [membership] = await db
    .select({ id: members.id })
    .from(members)
    .where(
      and(
        eq(members.organizationId, input.leagueId),
        eq(members.userId, input.userId),
      ),
    )
    .limit(1);

  if (!membership) {
    throw new AppError({
      code: "LORE_MEMBER_NOT_FOUND",
      message: "Lore actions require a member of the league",
      status: 403,
    });
  }

  return membership.id;
}

export function isLoreSteward(access: LeagueRoleAccess): boolean {
  return access.role === "commissioner" || access.role === "data_steward";
}
