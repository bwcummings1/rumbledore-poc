import { createAccessControl } from "better-auth/plugins/access";
import {
  adminAc,
  defaultStatements,
  memberAc,
  ownerAc,
} from "better-auth/plugins/organization/access";

/**
 * League-role access control (spec 01 §Auth). Role keys MUST match the
 * `league_role` pg enum in `src/db/schema.ts` — Better Auth writes them
 * verbatim into `members.role`/`invitations.role`.
 *
 * `leagueData` is the custom resource for the data-steward duty: reviewing
 * and cleaning a league's ingested history (spec 00 §data steward).
 */
const statement = {
  ...defaultStatements,
  leagueData: ["review", "manage"],
} as const;

export const ac = createAccessControl(statement);

export const roles = {
  // Org owner equivalent: full control of the league plus its data.
  commissioner: ac.newRole({
    ...ownerAc.statements,
    leagueData: ["review", "manage"],
  }),
  // Org admin equivalent: manages members/invitations, may review data.
  league_admin: ac.newRole({
    ...adminAc.statements,
    leagueData: ["review"],
  }),
  // Regular member plus the data-cleaning mandate.
  data_steward: ac.newRole({
    ...memberAc.statements,
    leagueData: ["review", "manage"],
  }),
  member: ac.newRole({
    ...memberAc.statements,
  }),
};
