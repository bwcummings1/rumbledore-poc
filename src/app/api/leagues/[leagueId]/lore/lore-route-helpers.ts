import { requireLeagueRole } from "@/auth/guards";
import { getDb } from "@/db";

export {
  getLoreMemberIdForUser as getMemberIdForUser,
  isLoreSteward,
} from "@/lore/member-auth";

export async function authorizeLoreMember(
  request: Request,
  leagueId: string,
  minRole: "data_steward" | "member" = "member",
) {
  const db = getDb();
  return {
    access: await requireLeagueRole({
      db,
      headers: request.headers,
      leagueId,
      minRole,
    }),
    db,
  };
}
