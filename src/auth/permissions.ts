import { createAccessControl } from "better-auth/plugins/access";
import {
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
  // Org owner *and* org admin equivalent: full control of the league plus its
  // data, and the only role that may assign roles (PROJECT_CONTEXT.md Q17).
  //
  // `league_admin` used to be a separate key here. T-008 granted it
  // `leagueData: ["review", "manage"]` so the ACL would stop contradicting
  // ROLE_RANK in src/auth/guards.ts — which left two names for one authority
  // level. That is the state a later edit would have broken again by amending
  // one name and not the other, so migration 0082 collapsed the value into
  // `commissioner` in the `league_role` pg enum and this key went with it
  // (PROJECT_CONTEXT.md Q16/§7.1, DD-5). Nothing is lost by dropping the key:
  // Better Auth's `ownerAc` statements are a strict superset of `adminAc`'s
  // (owner additionally holds `organization: delete`), so every action the old
  // `league_admin` could express is still expressible here.
  commissioner: ac.newRole({
    ...ownerAc.statements,
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
