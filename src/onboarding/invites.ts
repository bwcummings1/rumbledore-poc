import { createHash, randomBytes } from "node:crypto";
import { and, asc, eq, ne } from "drizzle-orm";
import { type LeagueRole, requireLeagueRoleForUser } from "@/auth/guards";
import { AppError, err, ok, type Result } from "@/core/result";
import type { Db } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  fantasyMembers,
  fantasyTeams,
  type LeagueInvite,
  leagueInvites,
  leagueMemberIdentityClaims,
  leagues,
  members,
  providerCredentials,
} from "@/db/schema";
import type { FantasyProviderId } from "@/providers";
import type { InviteNotifier } from "./notifier";

export type LeaguemateInviteChannel = "share" | "sms" | "email";

export interface LeagueInviteTarget {
  displayName: string;
  fantasyMemberId: string;
  provider: FantasyProviderId;
  providerMemberId: string;
  providerTeamIds: string[];
  teamNames: string[];
}

export interface LeagueInviteSummary {
  league: {
    id: string;
    name: string;
    provider: FantasyProviderId;
    providerLeagueId: string;
    season: number;
  };
  targets: LeagueInviteTarget[];
  totals: {
    importedMembers: number;
    inviteTargets: number;
  };
}

export interface CreatedLeaguemateInvite {
  channel: LeaguemateInviteChannel;
  expiresAt: string;
  inviteUrl: string;
  target: LeagueInviteTarget;
  targetHint: string | null;
  token: string;
}

export interface LeagueInviteLanding {
  expiresAt: string;
  inviteeDisplayName: string;
  league: {
    id: string;
    name: string;
    provider: FantasyProviderId;
    season: number;
  };
  teamNames: string[];
}

export interface AcceptedLeagueInvite {
  acceptedAt: string;
  league: {
    id: string;
    name: string;
    provider: FantasyProviderId;
    season: number;
  };
  providerMemberId: string;
  providerTeamIds: string[];
  teamNames: string[];
}

export interface LeagueInviteDependencies {
  db: Db;
  notifier: InviteNotifier;
  now?: () => Date;
}

type LeagueInviteError = AppError;

type LeagueRow = Pick<
  typeof leagues.$inferSelect,
  "id" | "name" | "provider" | "providerLeagueId" | "season"
>;

type FantasyMemberRow = Pick<
  typeof fantasyMembers.$inferSelect,
  "displayName" | "id" | "provider" | "providerMemberId"
>;

type FantasyTeamRow = Pick<
  typeof fantasyTeams.$inferSelect,
  "name" | "ownerMemberIds" | "providerTeamId"
>;

type IdentityClaimRow = Pick<
  typeof leagueMemberIdentityClaims.$inferSelect,
  "providerMemberId" | "userId"
>;

const INVITE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function currentTime(deps: Pick<LeagueInviteDependencies, "now">): Date {
  return deps.now?.() ?? new Date();
}

function inviteExpiresAt(now: Date): Date {
  return new Date(now.getTime() + INVITE_TTL_MS);
}

function notFoundError(): LeagueInviteError {
  return new AppError({
    code: "LEAGUE_INVITE_NOT_FOUND",
    message: "League invite was not found",
    status: 404,
  });
}

function invalidTargetError(): LeagueInviteError {
  return new AppError({
    code: "LEAGUE_INVITE_TARGET_NOT_FOUND",
    message: "That leaguemate is not available to invite",
    status: 404,
  });
}

function invalidDestinationError(): LeagueInviteError {
  return new AppError({
    code: "LEAGUE_INVITE_DESTINATION_INVALID",
    message: "Invite destination is required for this channel",
    status: 400,
  });
}

function alreadyAcceptedError(): LeagueInviteError {
  return new AppError({
    code: "LEAGUE_INVITE_ALREADY_ACCEPTED",
    message: "That league invite has already been accepted",
    status: 409,
  });
}

function claimConflictError(): LeagueInviteError {
  return new AppError({
    code: "LEAGUE_INVITE_CLAIM_CONFLICT",
    message: "That provider identity is already claimed",
    status: 409,
  });
}

function inviteStatusUnavailable(status: LeagueInvite["status"]): boolean {
  switch (status) {
    case "accepted":
    case "canceled":
      return true;
    case "pending":
    case "sent":
      return false;
  }
}

function inviteCannotBeAccepted(invite: LeagueInvite, now: Date): boolean {
  switch (invite.status) {
    case "canceled":
      return true;
    case "accepted":
    case "pending":
    case "sent":
      return invite.expiresAt <= now;
  }
}

function acceptedByAnotherUser(invite: LeagueInvite, userId: string): boolean {
  switch (invite.status) {
    case "accepted":
      break;
    case "canceled":
    case "pending":
    case "sent":
      return false;
  }

  if (!invite.acceptedUserId) {
    return false;
  }

  switch (invite.acceptedUserId) {
    case userId:
      return false;
    default:
      return true;
  }
}

function stringValuesDiffer(left: string, right: string): boolean {
  switch (left) {
    case right:
      return false;
    default:
      return true;
  }
}

function notifierError(cause: unknown): LeagueInviteError {
  return new AppError({
    cause,
    code: "LEAGUE_INVITE_DELIVERY_FAILED",
    message: "Invite notification could not be sent",
    status: 502,
  });
}

function stableHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function inviteToken(): string {
  return randomBytes(18).toString("base64url");
}

function normalizedDestination(
  channel: LeaguemateInviteChannel,
  destination: string | undefined,
): Result<
  { hash: string; hint: string | null; value: string | null },
  AppError
> {
  switch (channel) {
    case "share":
      return ok({ hash: "share", hint: null, value: null });
    case "email": {
      const value = destination?.trim().toLowerCase();
      if (!value) {
        return err(invalidDestinationError());
      }
      const [local = "", domain = ""] = value.split("@");
      const hint =
        domain.length > 0
          ? `${local.slice(0, 1) || "*"}***@${domain}`
          : "email";
      return ok({
        hash: stableHash(`email:${value}`),
        hint,
        value,
      });
    }
    case "sms": {
      const value = destination?.trim().replace(/[^\d+]/g, "");
      if (!value) {
        return err(invalidDestinationError());
      }
      return ok({
        hash: stableHash(`sms:${value}`),
        hint: `***${value.slice(-4)}`,
        value,
      });
    }
  }
}

function appBaseUrl(input: string): string {
  const url = new URL(input);
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function inviteUrl(
  baseUrl: string,
  invite: Pick<LeagueInvite, "leagueId" | "token">,
): string {
  return new URL(
    `/invite/${invite.leagueId}/${invite.token}`,
    appBaseUrl(baseUrl),
  ).toString();
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) =>
    left.localeCompare(right, undefined, {
      numeric: true,
      sensitivity: "base",
    }),
  );
}

function teamRefsByOwner(
  teams: readonly FantasyTeamRow[],
): Map<string, Array<{ name: string; providerTeamId: string }>> {
  const byOwner = new Map<
    string,
    Array<{ name: string; providerTeamId: string }>
  >();

  for (const team of teams) {
    for (const ownerMemberId of team.ownerMemberIds) {
      const rows = byOwner.get(ownerMemberId) ?? [];
      rows.push({ name: team.name, providerTeamId: team.providerTeamId });
      byOwner.set(ownerMemberId, rows);
    }
  }

  return byOwner;
}

function toInviteTarget(
  member: FantasyMemberRow,
  teamsByOwner: ReadonlyMap<
    string,
    Array<{ name: string; providerTeamId: string }>
  >,
): LeagueInviteTarget {
  const teamRefs = teamsByOwner.get(member.providerMemberId) ?? [];
  return {
    displayName: member.displayName,
    fantasyMemberId: member.id,
    provider: member.provider,
    providerMemberId: member.providerMemberId,
    providerTeamIds: sortedUnique(teamRefs.map((team) => team.providerTeamId)),
    teamNames: sortedUnique(teamRefs.map((team) => team.name)),
  };
}

async function authorizeLeagueMember(
  deps: LeagueInviteDependencies,
  input: { leagueId: string; userId: string; userRole?: LeagueRole },
): Promise<Result<LeagueRole, AppError>> {
  if (input.userRole) {
    return ok(input.userRole);
  }

  const access = await requireLeagueRoleForUser(deps.db, {
    leagueId: input.leagueId,
    userId: input.userId,
  });
  return access.ok ? ok(access.value.role) : access;
}

async function loadLeague(db: Db, leagueId: string): Promise<LeagueRow | null> {
  const [league] = await db
    .select({
      id: leagues.id,
      name: leagues.name,
      provider: leagues.provider,
      providerLeagueId: leagues.providerLeagueId,
      season: leagues.season,
    })
    .from(leagues)
    .where(eq(leagues.id, leagueId))
    .limit(1);

  return league ?? null;
}

async function loadTargets(
  deps: LeagueInviteDependencies,
  input: { league: LeagueRow; userId: string },
): Promise<LeagueInviteTarget[]> {
  const selfCredentials = await deps.db
    .select({
      provider: providerCredentials.provider,
      subjectProviderId: providerCredentials.subjectProviderId,
    })
    .from(providerCredentials)
    .where(
      and(
        eq(providerCredentials.userId, input.userId),
        eq(providerCredentials.provider, input.league.provider),
      ),
    );
  const selfProviderMemberIds = new Set(
    selfCredentials.map((credential) => credential.subjectProviderId),
  );

  const scoped = await withLeagueContext(
    deps.db,
    input.league.id,
    async (tx) => {
      const memberRows = await tx
        .select({
          displayName: fantasyMembers.displayName,
          id: fantasyMembers.id,
          provider: fantasyMembers.provider,
          providerMemberId: fantasyMembers.providerMemberId,
        })
        .from(fantasyMembers)
        .where(
          and(
            eq(fantasyMembers.leagueId, input.league.id),
            eq(fantasyMembers.season, input.league.season),
            eq(fantasyMembers.provider, input.league.provider),
          ),
        )
        .orderBy(asc(fantasyMembers.displayName));

      const teamRows = await tx
        .select({
          name: fantasyTeams.name,
          ownerMemberIds: fantasyTeams.ownerMemberIds,
          providerTeamId: fantasyTeams.providerTeamId,
        })
        .from(fantasyTeams)
        .where(
          and(
            eq(fantasyTeams.leagueId, input.league.id),
            eq(fantasyTeams.season, input.league.season),
            eq(fantasyTeams.provider, input.league.provider),
          ),
        );

      const identityClaimRows = await tx
        .select({
          providerMemberId: leagueMemberIdentityClaims.providerMemberId,
          userId: leagueMemberIdentityClaims.userId,
        })
        .from(leagueMemberIdentityClaims)
        .where(
          and(
            eq(leagueMemberIdentityClaims.leagueId, input.league.id),
            eq(leagueMemberIdentityClaims.provider, input.league.provider),
          ),
        );

      return {
        identityClaims: identityClaimRows satisfies IdentityClaimRow[],
        members: memberRows satisfies FantasyMemberRow[],
        teams: teamRows satisfies FantasyTeamRow[],
      };
    },
  );

  for (const claim of scoped.identityClaims) {
    if (claim.userId === input.userId) {
      selfProviderMemberIds.add(claim.providerMemberId);
    }
  }

  const claimedProviderMemberIds = new Set(
    scoped.identityClaims.map((claim) => claim.providerMemberId),
  );
  const teamsByOwner = teamRefsByOwner(scoped.teams);
  return scoped.members
    .filter((member) => !selfProviderMemberIds.has(member.providerMemberId))
    .filter((member) => !claimedProviderMemberIds.has(member.providerMemberId))
    .map((member) => toInviteTarget(member, teamsByOwner));
}

export async function listLeaguemateInviteTargets(
  deps: LeagueInviteDependencies,
  input: { leagueId: string; userId: string; userRole?: LeagueRole },
): Promise<Result<LeagueInviteSummary, LeagueInviteError>> {
  const authorized = await authorizeLeagueMember(deps, input);
  if (!authorized.ok) {
    return authorized;
  }

  const league = await loadLeague(deps.db, input.leagueId);
  if (!league) {
    return err(notFoundError());
  }

  const allTargets = await loadTargets(deps, {
    league,
    userId: input.userId,
  });

  return ok({
    league,
    targets: allTargets,
    totals: {
      importedMembers:
        allTargets.length +
        (await countSelfMembers(deps, {
          league,
          userId: input.userId,
        })),
      inviteTargets: allTargets.length,
    },
  });
}

async function countSelfMembers(
  deps: LeagueInviteDependencies,
  input: { league: LeagueRow; userId: string },
): Promise<number> {
  const selfCredentials = await deps.db
    .select({ subjectProviderId: providerCredentials.subjectProviderId })
    .from(providerCredentials)
    .where(
      and(
        eq(providerCredentials.userId, input.userId),
        eq(providerCredentials.provider, input.league.provider),
      ),
    );
  const selfIds = new Set(
    selfCredentials.map((credential) => credential.subjectProviderId),
  );

  const rows = await withLeagueContext(deps.db, input.league.id, async (tx) => {
    const fantasyMemberRows = await tx
      .select({ providerMemberId: fantasyMembers.providerMemberId })
      .from(fantasyMembers)
      .where(
        and(
          eq(fantasyMembers.leagueId, input.league.id),
          eq(fantasyMembers.season, input.league.season),
          eq(fantasyMembers.provider, input.league.provider),
        ),
      );

    const claimRows = await tx
      .select({ providerMemberId: leagueMemberIdentityClaims.providerMemberId })
      .from(leagueMemberIdentityClaims)
      .where(
        and(
          eq(leagueMemberIdentityClaims.leagueId, input.league.id),
          eq(leagueMemberIdentityClaims.userId, input.userId),
          eq(leagueMemberIdentityClaims.provider, input.league.provider),
        ),
      );

    for (const claim of claimRows) {
      selfIds.add(claim.providerMemberId);
    }

    return fantasyMemberRows;
  });

  return rows.filter((row) => selfIds.has(row.providerMemberId)).length;
}

async function deliverInvite(
  deps: LeagueInviteDependencies,
  input: {
    channel: LeaguemateInviteChannel;
    destination: string | null;
    inviteUrl: string;
    leagueName: string;
  },
): Promise<Result<void, LeagueInviteError>> {
  try {
    switch (input.channel) {
      case "share":
        return ok(undefined);
      case "sms":
        if (!input.destination) {
          return err(invalidDestinationError());
        }
        await deps.notifier.sendSms({
          body: `Join ${input.leagueName} on Rumbledore: ${input.inviteUrl}`,
          to: input.destination,
        });
        return ok(undefined);
      case "email":
        if (!input.destination) {
          return err(invalidDestinationError());
        }
        await deps.notifier.sendEmail({
          body: `You're invited to join ${input.leagueName} on Rumbledore.\n\n${input.inviteUrl}`,
          subject: `Join ${input.leagueName} on Rumbledore`,
          to: input.destination,
        });
        return ok(undefined);
    }
  } catch (cause) {
    return err(notifierError(cause));
  }
}

export async function createLeaguemateInvite(
  deps: LeagueInviteDependencies,
  input: {
    appBaseUrl: string;
    channel: LeaguemateInviteChannel;
    destination?: string;
    leagueId: string;
    providerMemberId: string;
    userId: string;
    userRole?: LeagueRole;
  },
): Promise<Result<CreatedLeaguemateInvite, LeagueInviteError>> {
  const authorized = await authorizeLeagueMember(deps, input);
  if (!authorized.ok) {
    return authorized;
  }

  const league = await loadLeague(deps.db, input.leagueId);
  if (!league) {
    return err(notFoundError());
  }

  const target = (
    await loadTargets(deps, {
      league,
      userId: input.userId,
    })
  ).find((candidate) => candidate.providerMemberId === input.providerMemberId);
  if (!target) {
    return err(invalidTargetError());
  }

  const destination = normalizedDestination(input.channel, input.destination);
  if (!destination.ok) {
    return destination;
  }

  const now = currentTime(deps);
  const expiresAt = inviteExpiresAt(now);
  const [invite] = await withLeagueContext(deps.db, league.id, (tx) =>
    tx
      .insert(leagueInvites)
      .values({
        channel: input.channel,
        expiresAt,
        fantasyMemberId: target.fantasyMemberId,
        inviteeDisplayName: target.displayName,
        inviterUserId: input.userId,
        leagueId: league.id,
        provider: target.provider,
        providerMemberId: target.providerMemberId,
        providerTeamIds: target.providerTeamIds,
        status: "pending",
        targetHash: destination.value.hash,
        targetHint: destination.value.hint,
        teamNames: target.teamNames,
        token: inviteToken(),
      })
      .onConflictDoUpdate({
        set: {
          expiresAt,
          fantasyMemberId: target.fantasyMemberId,
          inviteeDisplayName: target.displayName,
          inviterUserId: input.userId,
          providerTeamIds: target.providerTeamIds,
          status: "pending",
          targetHint: destination.value.hint,
          teamNames: target.teamNames,
          updatedAt: now,
        },
        target: [
          leagueInvites.leagueId,
          leagueInvites.provider,
          leagueInvites.providerMemberId,
          leagueInvites.channel,
          leagueInvites.targetHash,
        ],
      })
      .returning(),
  );
  if (!invite) {
    return err(notFoundError());
  }

  const url = inviteUrl(input.appBaseUrl, invite);
  const delivered = await deliverInvite(deps, {
    channel: input.channel,
    destination: destination.value.value,
    inviteUrl: url,
    leagueName: league.name,
  });
  if (!delivered.ok) {
    return delivered;
  }

  const sentAt = input.channel === "share" ? null : now;
  if (sentAt) {
    await withLeagueContext(deps.db, league.id, (tx) =>
      tx
        .update(leagueInvites)
        .set({
          sentAt,
          status: "sent",
          updatedAt: now,
        })
        .where(
          and(
            eq(leagueInvites.leagueId, league.id),
            eq(leagueInvites.id, invite.id),
          ),
        ),
    );
  }

  return ok({
    channel: input.channel,
    expiresAt: expiresAt.toISOString(),
    inviteUrl: url,
    target,
    targetHint: destination.value.hint,
    token: invite.token,
  });
}

export async function getLeagueInviteLanding(
  deps: Pick<LeagueInviteDependencies, "db" | "now">,
  input: { leagueId: string; token: string },
): Promise<Result<LeagueInviteLanding, LeagueInviteError>> {
  if (!UUID_RE.test(input.leagueId) || input.token.trim().length === 0) {
    return err(notFoundError());
  }

  const now = currentTime(deps);
  const [invite] = await withLeagueContext(deps.db, input.leagueId, (tx) =>
    tx
      .select({
        expiresAt: leagueInvites.expiresAt,
        inviteeDisplayName: leagueInvites.inviteeDisplayName,
        status: leagueInvites.status,
        teamNames: leagueInvites.teamNames,
      })
      .from(leagueInvites)
      .where(
        and(
          eq(leagueInvites.leagueId, input.leagueId),
          eq(leagueInvites.token, input.token),
        ),
      )
      .limit(1),
  );

  if (
    !invite ||
    inviteStatusUnavailable(invite.status) ||
    invite.expiresAt <= now
  ) {
    return err(notFoundError());
  }

  const league = await loadLeague(deps.db, input.leagueId);
  if (!league) {
    return err(notFoundError());
  }

  return ok({
    expiresAt: invite.expiresAt.toISOString(),
    inviteeDisplayName: invite.inviteeDisplayName,
    league: {
      id: league.id,
      name: league.name,
      provider: league.provider,
      season: league.season,
    },
    teamNames: invite.teamNames,
  });
}

type AcceptInviteOutcome =
  | { kind: "accepted"; value: AcceptedLeagueInvite }
  | { kind: "already_accepted" }
  | { kind: "claim_conflict" }
  | { kind: "not_found" };

export async function acceptLeagueInvite(
  deps: Pick<LeagueInviteDependencies, "db" | "now">,
  input: { leagueId: string; token: string; userId: string },
): Promise<Result<AcceptedLeagueInvite, LeagueInviteError>> {
  if (!UUID_RE.test(input.leagueId) || input.token.trim().length === 0) {
    return err(notFoundError());
  }

  const now = currentTime(deps);
  const outcome = await withLeagueContext(
    deps.db,
    input.leagueId,
    async (tx): Promise<AcceptInviteOutcome> => {
      const [invite] = await tx
        .select()
        .from(leagueInvites)
        .where(
          and(
            eq(leagueInvites.leagueId, input.leagueId),
            eq(leagueInvites.token, input.token),
          ),
        )
        .limit(1);

      if (!invite || inviteCannotBeAccepted(invite, now)) {
        return { kind: "not_found" };
      }

      if (acceptedByAnotherUser(invite, input.userId)) {
        return { kind: "already_accepted" };
      }

      const [league] = await tx
        .select({
          id: leagues.id,
          name: leagues.name,
          provider: leagues.provider,
          season: leagues.season,
        })
        .from(leagues)
        .where(eq(leagues.id, input.leagueId))
        .limit(1);
      if (!league) {
        return { kind: "not_found" };
      }

      await tx
        .insert(members)
        .values({
          organizationId: input.leagueId,
          role: "member",
          userId: input.userId,
        })
        .onConflictDoNothing({
          target: [members.organizationId, members.userId],
        });

      const [claim] = await tx
        .insert(leagueMemberIdentityClaims)
        .values({
          claimedAt: now,
          fantasyMemberId: invite.fantasyMemberId,
          leagueId: input.leagueId,
          provider: invite.provider,
          providerMemberId: invite.providerMemberId,
          providerTeamIds: invite.providerTeamIds,
          sourceInviteId: invite.id,
          userId: input.userId,
        })
        .onConflictDoNothing()
        .returning();

      if (!claim) {
        const [existingForUser] = await tx
          .select({
            providerMemberId: leagueMemberIdentityClaims.providerMemberId,
          })
          .from(leagueMemberIdentityClaims)
          .where(
            and(
              eq(leagueMemberIdentityClaims.leagueId, input.leagueId),
              eq(leagueMemberIdentityClaims.userId, input.userId),
              eq(leagueMemberIdentityClaims.provider, invite.provider),
            ),
          )
          .limit(1);
        if (
          existingForUser &&
          stringValuesDiffer(
            existingForUser.providerMemberId,
            invite.providerMemberId,
          )
        ) {
          return { kind: "claim_conflict" };
        }

        const [existingForProviderMember] = await tx
          .select({ userId: leagueMemberIdentityClaims.userId })
          .from(leagueMemberIdentityClaims)
          .where(
            and(
              eq(leagueMemberIdentityClaims.leagueId, input.leagueId),
              eq(leagueMemberIdentityClaims.provider, invite.provider),
              eq(
                leagueMemberIdentityClaims.providerMemberId,
                invite.providerMemberId,
              ),
            ),
          )
          .limit(1);
        if (
          existingForProviderMember &&
          stringValuesDiffer(existingForProviderMember.userId, input.userId)
        ) {
          return { kind: "claim_conflict" };
        }
      }

      const acceptedAt = invite.acceptedAt ?? now;
      await tx
        .update(leagueInvites)
        .set({
          acceptedAt,
          acceptedUserId: input.userId,
          status: "accepted",
          updatedAt: now,
        })
        .where(
          and(
            eq(leagueInvites.leagueId, input.leagueId),
            eq(leagueInvites.provider, invite.provider),
            eq(leagueInvites.providerMemberId, invite.providerMemberId),
            ne(leagueInvites.status, "canceled"),
          ),
        );

      return {
        kind: "accepted",
        value: {
          acceptedAt: acceptedAt.toISOString(),
          league,
          providerMemberId: invite.providerMemberId,
          providerTeamIds: invite.providerTeamIds,
          teamNames: invite.teamNames,
        },
      };
    },
  );

  switch (outcome.kind) {
    case "accepted":
      return ok(outcome.value);
    case "already_accepted":
      return err(alreadyAcceptedError());
    case "claim_conflict":
      return err(claimConflictError());
    case "not_found":
      return err(notFoundError());
  }
}
