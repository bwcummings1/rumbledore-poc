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
  // Org admin equivalent: manages members/invitations, and — like the
  // commissioner — may manage league data.
  //
  // This deliberately grants `manage`, matching ROLE_RANK in src/auth/guards.ts,
  // where league_admin outranks data_steward. The owner's ruling is that an
  // admin can do anything an assigned role can do, while an assigned role
  // cannot do everything an admin can (PROJECT_CONTEXT.md §7.1, DD-5).
  //
  // It previously granted only ["review"], which contradicted the rank ladder.
  // Because every route guard resolves through ROLE_RANK and nothing server-side
  // calls hasPermission, the ladder silently won and league_admin already passed
  // every data_steward gate — the ACL was decorative and misleading rather than
  // enforced. Aligning it here removes the second, disagreeing authority model.
  league_admin: ac.newRole({
    ...adminAc.statements,
    leagueData: ["review", "manage"],
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
