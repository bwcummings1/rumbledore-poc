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
  onboardingDiscoveredLeagues,
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
  suggestedChannel: LeaguemateInviteChannel;
  teamNames: string[];
}

export interface LeagueInviteClaimTarget {
  displayName: string;
  providerMemberId: string;
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

export interface CreatedOpenLeagueInvite {
  channel: "share";
  expiresAt: string;
  inviteUrl: string;
  target: null;
  targetHint: null;
  token: string;
}

export interface LeagueInviteLanding {
  claimMode: "targeted" | "open";
  claimTargets: LeagueInviteClaimTarget[];
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

type AcceptableInvite = LeagueInvite & {
  providerMemberId: string | null;
};

interface LoadedInviteTargets {
  importedMembers: number;
  targets: LeagueInviteTarget[];
}

const INVITE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PHONE_DIGITS = 7;
const OPEN_INVITE_DISPLAY_NAME = "Claim your team";
const OPEN_INVITE_TARGET_HASH = "roster";

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

function inviteTeamRequiredError(): LeagueInviteError {
  return new AppError({
    code: "LEAGUE_INVITE_TEAM_REQUIRED",
    message: "Choose a team before accepting this invite",
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

function inviteTokenHash(token: string): string {
  return stableHash(`league-invite:${token}`);
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
      if (!value || !EMAIL_RE.test(value)) {
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
      const rawValue = destination?.trim() ?? "";
      const digits = rawValue.replace(/\D/g, "");
      if (digits.length < MIN_PHONE_DIGITS) {
        return err(invalidDestinationError());
      }
      const value = rawValue.startsWith("+") ? `+${digits}` : digits;
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
  invite: { leagueId: string; token: string },
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
    suggestedChannel: "share",
    teamNames: sortedUnique(teamRefs.map((team) => team.name)),
  };
}

function toInviteTargetFromInvite(
  invite: AcceptableInvite,
): LeagueInviteTarget | null {
  if (!invite.providerMemberId || !invite.fantasyMemberId) {
    return null;
  }

  return {
    displayName: invite.inviteeDisplayName,
    fantasyMemberId: invite.fantasyMemberId,
    provider: invite.provider,
    providerMemberId: invite.providerMemberId,
    providerTeamIds: invite.providerTeamIds,
    suggestedChannel: invite.channel,
    teamNames: invite.teamNames,
  };
}

function openClaimTargets(
  targets: readonly LeagueInviteTarget[],
): LeagueInviteTarget[] {
  return targets.filter((target) => target.providerTeamIds.length > 0);
}

function toPublicClaimTarget(
  target: LeagueInviteTarget,
): LeagueInviteClaimTarget {
  return {
    displayName: target.displayName,
    providerMemberId: target.providerMemberId,
    teamNames: target.teamNames,
  };
}

async function authorizeLeagueMember(
  deps: Pick<LeagueInviteDependencies, "db">,
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
  deps: Pick<LeagueInviteDependencies, "db">,
  input: { league: LeagueRow; userId: string },
): Promise<LoadedInviteTargets> {
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
  const discoveredSelfTeams = await deps.db
    .select({ providerTeamId: onboardingDiscoveredLeagues.providerTeamId })
    .from(onboardingDiscoveredLeagues)
    .where(
      and(
        eq(onboardingDiscoveredLeagues.userId, input.userId),
        eq(onboardingDiscoveredLeagues.provider, input.league.provider),
        eq(
          onboardingDiscoveredLeagues.providerLeagueId,
          input.league.providerLeagueId,
        ),
        eq(onboardingDiscoveredLeagues.season, input.league.season),
      ),
    );
  const selfProviderTeamIds = new Set(
    discoveredSelfTeams
      .map((team) => team.providerTeamId)
      .filter((providerTeamId): providerTeamId is string =>
        Boolean(providerTeamId),
      ),
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
  for (const team of scoped.teams) {
    if (selfProviderTeamIds.has(team.providerTeamId)) {
      for (const ownerMemberId of team.ownerMemberIds) {
        selfProviderMemberIds.add(ownerMemberId);
      }
    }
  }

  const claimedProviderMemberIds = new Set(
    scoped.identityClaims.map((claim) => claim.providerMemberId),
  );
  const teamsByOwner = teamRefsByOwner(scoped.teams);
  const targets = scoped.members
    .filter((member) => !selfProviderMemberIds.has(member.providerMemberId))
    .filter((member) => !claimedProviderMemberIds.has(member.providerMemberId))
    .map((member) => toInviteTarget(member, teamsByOwner));

  return {
    importedMembers: scoped.members.length,
    targets,
  };
}

export async function listLeaguemateInviteTargets(
  deps: Pick<LeagueInviteDependencies, "db">,
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

  const loadedTargets = await loadTargets(deps, {
    league,
    userId: input.userId,
  });

  return ok({
    league,
    targets: loadedTargets.targets,
    totals: {
      importedMembers: loadedTargets.importedMembers,
      inviteTargets: loadedTargets.targets.length,
    },
  });
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

  const loadedTargets = await loadTargets(deps, {
    league,
    userId: input.userId,
  });
  const target = loadedTargets.targets.find(
    (candidate) => candidate.providerMemberId === input.providerMemberId,
  );
  if (!target) {
    return err(invalidTargetError());
  }

  const destination = normalizedDestination(input.channel, input.destination);
  if (!destination.ok) {
    return destination;
  }

  const now = currentTime(deps);
  const expiresAt = inviteExpiresAt(now);
  const token = inviteToken();
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
        tokenHash: inviteTokenHash(token),
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
          tokenHash: inviteTokenHash(token),
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

  const url = inviteUrl(input.appBaseUrl, { leagueId: invite.leagueId, token });
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
    token,
  });
}

export async function createOpenLeagueInvite(
  deps: LeagueInviteDependencies,
  input: {
    appBaseUrl: string;
    leagueId: string;
    userId: string;
    userRole?: LeagueRole;
  },
): Promise<Result<CreatedOpenLeagueInvite, LeagueInviteError>> {
  const authorized = await authorizeLeagueMember(deps, input);
  if (!authorized.ok) {
    return authorized;
  }

  const league = await loadLeague(deps.db, input.leagueId);
  if (!league) {
    return err(notFoundError());
  }

  const now = currentTime(deps);
  const expiresAt = inviteExpiresAt(now);
  const token = inviteToken();
  const [invite] = await withLeagueContext(deps.db, league.id, (tx) =>
    tx
      .insert(leagueInvites)
      .values({
        channel: "share",
        expiresAt,
        fantasyMemberId: null,
        inviteeDisplayName: OPEN_INVITE_DISPLAY_NAME,
        inviterUserId: input.userId,
        leagueId: league.id,
        provider: league.provider,
        providerMemberId: null,
        providerTeamIds: [],
        status: "pending",
        targetHash: OPEN_INVITE_TARGET_HASH,
        targetHint: null,
        teamNames: [],
        tokenHash: inviteTokenHash(token),
      })
      .returning(),
  );
  if (!invite) {
    return err(notFoundError());
  }

  return ok({
    channel: "share",
    expiresAt: expiresAt.toISOString(),
    inviteUrl: inviteUrl(input.appBaseUrl, {
      leagueId: invite.leagueId,
      token,
    }),
    target: null,
    targetHint: null,
    token,
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
  const tokenHash = inviteTokenHash(input.token);
  const [invite] = await withLeagueContext(deps.db, input.leagueId, (tx) =>
    tx
      .select({
        expiresAt: leagueInvites.expiresAt,
        inviteeDisplayName: leagueInvites.inviteeDisplayName,
        inviterUserId: leagueInvites.inviterUserId,
        providerMemberId: leagueInvites.providerMemberId,
        status: leagueInvites.status,
        teamNames: leagueInvites.teamNames,
      })
      .from(leagueInvites)
      .where(
        and(
          eq(leagueInvites.leagueId, input.leagueId),
          eq(leagueInvites.tokenHash, tokenHash),
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

  const claimTargets = invite.providerMemberId
    ? []
    : openClaimTargets(
        (
          await loadTargets(deps, {
            league,
            userId: invite.inviterUserId,
          })
        ).targets,
      ).map(toPublicClaimTarget);

  return ok({
    claimMode: invite.providerMemberId ? "targeted" : "open",
    claimTargets,
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

interface ResolvedInviteAcceptance {
  invite: AcceptableInvite;
  league: LeagueRow;
  target: LeagueInviteTarget;
}

async function resolveInviteAcceptance(
  deps: Pick<LeagueInviteDependencies, "db">,
  input: {
    leagueId: string;
    now: Date;
    providerMemberId?: string;
    tokenHash: string;
    userId: string;
  },
): Promise<Result<ResolvedInviteAcceptance, LeagueInviteError>> {
  const [invite] = await withLeagueContext(deps.db, input.leagueId, (tx) =>
    tx
      .select()
      .from(leagueInvites)
      .where(
        and(
          eq(leagueInvites.leagueId, input.leagueId),
          eq(leagueInvites.tokenHash, input.tokenHash),
        ),
      )
      .limit(1),
  );

  if (!invite || inviteCannotBeAccepted(invite, input.now)) {
    return err(notFoundError());
  }

  if (acceptedByAnotherUser(invite, input.userId)) {
    return err(alreadyAcceptedError());
  }

  const league = await loadLeague(deps.db, input.leagueId);
  if (!league) {
    return err(notFoundError());
  }

  const selectedProviderMemberId = input.providerMemberId?.trim();
  if (invite.providerMemberId) {
    if (
      selectedProviderMemberId &&
      stringValuesDiffer(selectedProviderMemberId, invite.providerMemberId)
    ) {
      return err(invalidTargetError());
    }

    const target = toInviteTargetFromInvite(invite);
    return target ? ok({ invite, league, target }) : err(notFoundError());
  }

  if (!selectedProviderMemberId) {
    return err(inviteTeamRequiredError());
  }

  const availableTargets = openClaimTargets(
    (
      await loadTargets(deps, {
        league,
        userId: invite.inviterUserId,
      })
    ).targets,
  );
  const target = availableTargets.find(
    (candidate) => candidate.providerMemberId === selectedProviderMemberId,
  );
  if (target) {
    return ok({ invite, league, target });
  }

  const [existingClaim] = await withLeagueContext(
    deps.db,
    input.leagueId,
    (tx) =>
      tx
        .select({ userId: leagueMemberIdentityClaims.userId })
        .from(leagueMemberIdentityClaims)
        .where(
          and(
            eq(leagueMemberIdentityClaims.leagueId, input.leagueId),
            eq(leagueMemberIdentityClaims.provider, league.provider),
            eq(
              leagueMemberIdentityClaims.providerMemberId,
              selectedProviderMemberId,
            ),
          ),
        )
        .limit(1),
  );

  return existingClaim ? err(claimConflictError()) : err(invalidTargetError());
}

export async function acceptLeagueInvite(
  deps: Pick<LeagueInviteDependencies, "db" | "now">,
  input: {
    leagueId: string;
    providerMemberId?: string;
    token: string;
    userId: string;
  },
): Promise<Result<AcceptedLeagueInvite, LeagueInviteError>> {
  if (!UUID_RE.test(input.leagueId) || input.token.trim().length === 0) {
    return err(notFoundError());
  }

  const now = currentTime(deps);
  const tokenHash = inviteTokenHash(input.token);
  const resolved = await resolveInviteAcceptance(deps, {
    leagueId: input.leagueId,
    now,
    providerMemberId: input.providerMemberId,
    tokenHash,
    userId: input.userId,
  });
  if (!resolved.ok) {
    return resolved;
  }

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
            eq(leagueInvites.tokenHash, tokenHash),
          ),
        )
        .limit(1);

      if (!invite || inviteCannotBeAccepted(invite, now)) {
        return { kind: "not_found" };
      }

      if (acceptedByAnotherUser(invite, input.userId)) {
        return { kind: "already_accepted" };
      }

      if (
        invite.providerMemberId &&
        stringValuesDiffer(
          invite.providerMemberId,
          resolved.value.target.providerMemberId,
        )
      ) {
        return { kind: "not_found" };
      }

      const [existingForUser] = await tx
        .select({
          providerMemberId: leagueMemberIdentityClaims.providerMemberId,
        })
        .from(leagueMemberIdentityClaims)
        .where(
          and(
            eq(leagueMemberIdentityClaims.leagueId, input.leagueId),
            eq(leagueMemberIdentityClaims.userId, input.userId),
            eq(
              leagueMemberIdentityClaims.provider,
              resolved.value.target.provider,
            ),
          ),
        )
        .limit(1);
      if (
        existingForUser &&
        stringValuesDiffer(
          existingForUser.providerMemberId,
          resolved.value.target.providerMemberId,
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
            eq(
              leagueMemberIdentityClaims.provider,
              resolved.value.target.provider,
            ),
            eq(
              leagueMemberIdentityClaims.providerMemberId,
              resolved.value.target.providerMemberId,
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

      if (!existingForUser) {
        const [claim] = await tx
          .insert(leagueMemberIdentityClaims)
          .values({
            claimedAt: now,
            fantasyMemberId: resolved.value.target.fantasyMemberId,
            leagueId: input.leagueId,
            provider: resolved.value.target.provider,
            providerMemberId: resolved.value.target.providerMemberId,
            providerTeamIds: resolved.value.target.providerTeamIds,
            sourceInviteId: invite.id,
            userId: input.userId,
          })
          .onConflictDoNothing()
          .returning();

        if (!claim) {
          return { kind: "claim_conflict" };
        }
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

      const acceptedAt = invite.providerMemberId
        ? (invite.acceptedAt ?? now)
        : now;
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
            eq(leagueInvites.provider, resolved.value.target.provider),
            eq(
              leagueInvites.providerMemberId,
              resolved.value.target.providerMemberId,
            ),
            ne(leagueInvites.status, "canceled"),
          ),
        );

      return {
        kind: "accepted",
        value: {
          acceptedAt: acceptedAt.toISOString(),
          league: {
            id: resolved.value.league.id,
            name: resolved.value.league.name,
            provider: resolved.value.league.provider,
            season: resolved.value.league.season,
          },
          providerMemberId: resolved.value.target.providerMemberId,
          providerTeamIds: resolved.value.target.providerTeamIds,
          teamNames: resolved.value.target.teamNames,
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
