import { and, eq, inArray } from "drizzle-orm";
import { AppError, err, ok, type Result } from "@/core/result";
import type { Db } from "@/db/client";
import { type Member, members } from "@/db/schema";

export type LeagueRole = Member["role"];

export interface AuthSession {
  user: { id: string };
}

export interface AuthenticatedSession {
  session: AuthSession;
  userId: string;
}

export interface LeagueRoleAccess extends AuthenticatedSession {
  leagueId: string;
  role: LeagueRole;
}

export type GetAuthSession = (headers: Headers) => Promise<AuthSession | null>;

export interface SessionGuardInput {
  getSession?: GetAuthSession;
  headers: Headers;
}

export interface LeagueRoleGuardInput extends SessionGuardInput {
  db: Db;
  leagueId: string;
  minRole?: LeagueRole;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ROLE_RANK: Record<LeagueRole, number> = {
  member: 0,
  data_steward: 1,
  league_admin: 2,
  commissioner: 3,
};

function authError(): AppError {
  return new AppError({
    code: "UNAUTHORIZED",
    message: "Authentication required",
    status: 401,
  });
}

function invalidLeagueIdError(): AppError {
  return new AppError({
    code: "INVALID_LEAGUE_ID",
    message: "League id must be a UUID",
    status: 400,
  });
}

function forbiddenLeagueError(): AppError {
  return new AppError({
    code: "LEAGUE_FORBIDDEN",
    message: "League access requires membership",
    status: 403,
  });
}

async function defaultGetSession(
  headers: Headers,
): Promise<AuthSession | null> {
  const { getAuth } = await import("@/auth");
  return getAuth().api.getSession({ headers });
}

function canSatisfyRole(role: LeagueRole, minRole: LeagueRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minRole];
}

export function isValidLeagueId(leagueId: string): boolean {
  return UUID_RE.test(leagueId);
}

export async function requireSession({
  getSession = defaultGetSession,
  headers,
}: SessionGuardInput): Promise<Result<AuthenticatedSession, AppError>> {
  const session = await getSession(headers);
  if (!session?.user.id) {
    return err(authError());
  }

  return ok({ session, userId: session.user.id });
}

export async function requireLeagueRoleForUser(
  db: Db,
  input: { leagueId: string; minRole?: LeagueRole; userId: string },
): Promise<Result<Omit<LeagueRoleAccess, "session">, AppError>> {
  if (!isValidLeagueId(input.leagueId)) {
    return err(invalidLeagueIdError());
  }

  const minRole = input.minRole ?? "member";
  const [membership] = await db
    .select({ role: members.role })
    .from(members)
    .where(
      and(
        eq(members.organizationId, input.leagueId),
        eq(members.userId, input.userId),
      ),
    )
    .limit(1);

  if (!membership || !canSatisfyRole(membership.role, minRole)) {
    return err(forbiddenLeagueError());
  }

  return ok({
    leagueId: input.leagueId,
    role: membership.role,
    userId: input.userId,
  });
}

export async function requireLeagueRole({
  db,
  getSession,
  headers,
  leagueId,
  minRole,
}: LeagueRoleGuardInput): Promise<Result<LeagueRoleAccess, AppError>> {
  const session = await requireSession({ getSession, headers });
  if (!session.ok) {
    return session;
  }

  const access = await requireLeagueRoleForUser(db, {
    leagueId,
    minRole,
    userId: session.value.userId,
  });
  if (!access.ok) {
    return access;
  }

  return ok({ ...access.value, session: session.value.session });
}

export async function listLeagueMembershipsForUser(
  db: Db,
  input: {
    leagueIds?: readonly string[];
    minRole?: LeagueRole;
    userId: string;
  },
): Promise<Result<Array<{ leagueId: string; role: LeagueRole }>, AppError>> {
  const requestedLeagueIds = [...new Set(input.leagueIds ?? [])].sort();
  const invalid = requestedLeagueIds.find(
    (leagueId) => !isValidLeagueId(leagueId),
  );
  if (invalid) {
    return err(invalidLeagueIdError());
  }

  const filters = [eq(members.userId, input.userId)];
  if (requestedLeagueIds.length > 0) {
    filters.push(inArray(members.organizationId, requestedLeagueIds));
  }

  const rows = await db
    .select({ leagueId: members.organizationId, role: members.role })
    .from(members)
    .where(and(...filters));

  const minRole = input.minRole ?? "member";
  const memberships = rows
    .filter((row) => canSatisfyRole(row.role, minRole))
    .map((row) => ({ leagueId: row.leagueId, role: row.role }))
    .sort((left, right) => left.leagueId.localeCompare(right.leagueId));

  if (
    requestedLeagueIds.length > 0 &&
    memberships.length !== requestedLeagueIds.length
  ) {
    return err(forbiddenLeagueError());
  }

  return ok(memberships);
}
