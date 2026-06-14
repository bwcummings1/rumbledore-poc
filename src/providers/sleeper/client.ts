import { z } from "zod";
import { err, ok } from "@/core/result";
import {
  AuthExpiredError,
  type FantasyProvider,
  type FantasyProviderCapabilities,
  type FantasyProviderSession,
  type NormalizedFinalStanding,
  type NormalizedLeague,
  type NormalizedMatchup,
  type NormalizedMatchupStatus,
  type NormalizedMatchupWinner,
  type NormalizedMember,
  type NormalizedRoster,
  type NormalizedRosterEntry,
  type NormalizedSeasonBundle,
  type NormalizedTeam,
  type NormalizedTransaction,
  type NormalizedTransactionType,
  ProviderBlockedError,
  type ProviderEntityRef,
  type ProviderLeagueRef,
  ProviderNotFoundError,
  ProviderParseError,
  type ProviderResult,
  RateLimitedError,
  type SeasonScopedProviderEntityRef,
} from "../model";

export interface SleeperCredentials {
  usernameOrUserId: string;
  seasons?: number[];
}

export interface SleeperSession extends FantasyProviderSession {
  provider: "sleeper";
  authKind: "none";
  subjectProviderId: string;
  username?: string;
  displayName?: string;
  currentLeagueSeason: number;
  discoverySeasons: number[];
}

export type SleeperFetch = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface SleeperClientOptions {
  fetch?: SleeperFetch;
  maxAttempts?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
}

export type SleeperProvider = FantasyProvider<
  SleeperCredentials,
  SleeperSession
>;

const SLEEPER_PROVIDER_ID = "sleeper";
const SLEEPER_API_ORIGIN = "https://api.sleeper.app";
const SLEEPER_AVATAR_ORIGIN = "https://sleepercdn.com";
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 250;
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_DISCOVERY_SEASONS = 10;
const MAX_FANTASY_WEEKS = 18;
const SLEEPER_USER_AGENT = "Rumbledore/2.0 (+https://rumbledore.app)";

export const SLEEPER_PROVIDER_CAPABILITIES: FantasyProviderCapabilities = {
  authKind: "none",
  dataClasses: {
    league: "full",
    teams: "full",
    members: "full",
    rosters: "full",
    matchups: "full",
    final_standings: "partial",
    transactions: "full",
    history: "partial",
    divisions: "none",
    keeper_dynasty: "partial",
    scoring_detail: "partial",
  },
  requiresOAuth: false,
  supportsHistory: true,
  supportsRosters: true,
  supportsTransactions: true,
};

const idValue = z.union([z.string(), z.number()]);
const numericValue = z.union([z.number(), z.string()]);
const nullableIdValue = z.union([z.string(), z.number()]).nullable();
const nullableString = z.string().nullable().optional();
const nullableNumericValue = z.union([z.number(), z.string()]).nullable();
const playerIdArray = z.array(idValue);
const recordNumberSchema = z.union([z.number(), z.string(), z.null()]);

const sleeperUserSchema = z
  .object({
    avatar: nullableString,
    display_name: nullableString,
    user_id: idValue,
    username: nullableString,
  })
  .passthrough();

const sleeperStateSchema = z
  .object({
    display_week: numericValue.optional(),
    league_season: numericValue.optional(),
    previous_season: numericValue.optional(),
    season: numericValue.optional(),
    season_type: z.string().optional(),
    week: numericValue.optional(),
  })
  .passthrough();

const sleeperLeagueSchema = z
  .object({
    avatar: nullableString,
    league_id: idValue,
    name: nullableString,
    previous_league_id: nullableIdValue.optional(),
    roster_positions: z.array(z.string()).optional(),
    scoring_settings: z
      .object({
        rec: numericValue.optional(),
      })
      .catchall(z.unknown())
      .optional(),
    season: numericValue.optional(),
    settings: z
      .object({
        last_scored_leg: numericValue.optional(),
        playoff_week_start: numericValue.optional(),
        start_week: numericValue.optional(),
      })
      .catchall(z.unknown())
      .optional(),
    sport: z.string().optional(),
    status: z.string().optional(),
    total_rosters: numericValue.optional(),
  })
  .passthrough();

const sleeperLeagueListSchema = z.array(sleeperLeagueSchema);

const sleeperRosterSchema = z
  .object({
    co_owners: z.array(idValue).optional(),
    league_id: idValue.optional(),
    owner_id: nullableIdValue.optional(),
    players: playerIdArray.nullable().optional(),
    reserve: playerIdArray.nullable().optional(),
    roster_id: numericValue,
    settings: z
      .object({
        fpts: numericValue.optional(),
        fpts_against: numericValue.optional(),
        fpts_against_decimal: numericValue.optional(),
        fpts_decimal: numericValue.optional(),
        losses: numericValue.optional(),
        ties: numericValue.optional(),
        wins: numericValue.optional(),
      })
      .catchall(z.unknown())
      .optional(),
    starters: playerIdArray.nullable().optional(),
    taxi: playerIdArray.nullable().optional(),
  })
  .passthrough();

const sleeperRosterListSchema = z.array(sleeperRosterSchema);

const sleeperLeagueUserSchema = z
  .object({
    avatar: nullableString,
    display_name: nullableString,
    is_owner: z.boolean().optional(),
    metadata: z
      .object({
        team_name: nullableString,
        team_abbr: nullableString,
      })
      .catchall(z.unknown())
      .nullable()
      .optional(),
    user_id: idValue,
    username: nullableString,
  })
  .passthrough();

const sleeperLeagueUserListSchema = z.array(sleeperLeagueUserSchema);

const sleeperMatchupSchema = z
  .object({
    custom_points: nullableNumericValue.optional(),
    matchup_id: nullableNumericValue.optional(),
    players: playerIdArray.nullable().optional(),
    players_points: z.record(z.string(), recordNumberSchema).optional(),
    points: numericValue.optional(),
    roster_id: numericValue,
    starters: playerIdArray.nullable().optional(),
    starters_points: z.array(recordNumberSchema).optional(),
  })
  .passthrough();

const sleeperMatchupListSchema = z.array(sleeperMatchupSchema);

const sleeperTransactionSchema = z
  .object({
    adds: z.record(z.string(), recordNumberSchema).nullable().optional(),
    consenter_ids: z.array(idValue).optional(),
    created: numericValue.optional(),
    creator: nullableIdValue.optional(),
    drops: z.record(z.string(), recordNumberSchema).nullable().optional(),
    leg: numericValue.optional(),
    roster_ids: z.array(idValue).optional(),
    status: z.string().optional(),
    status_updated: numericValue.optional(),
    transaction_id: idValue,
    type: z.string().optional(),
  })
  .passthrough();

const sleeperTransactionListSchema = z.array(sleeperTransactionSchema);

type SleeperLeague = z.infer<typeof sleeperLeagueSchema>;
type SleeperLeagueUser = z.infer<typeof sleeperLeagueUserSchema>;
type SleeperMatchup = z.infer<typeof sleeperMatchupSchema>;
type SleeperRoster = z.infer<typeof sleeperRosterSchema>;
type SleeperState = z.infer<typeof sleeperStateSchema>;
type SleeperTransaction = z.infer<typeof sleeperTransactionSchema>;
type SleeperUser = z.infer<typeof sleeperUserSchema>;

function toId(value: string | number | null | undefined): string | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : undefined;
  }

  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function toInteger(
  value: string | number | null | undefined,
): number | undefined {
  if (typeof value === "number") {
    return Number.isInteger(value) ? value : undefined;
  }
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function toNumber(
  value: string | number | null | undefined,
): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function compactUnique(values: (string | null | undefined)[]): string[] {
  return [
    ...new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  ];
}

function avatarUrl(avatar: string | null | undefined): string | undefined {
  const trimmed = avatar?.trim();
  if (!trimmed) {
    return undefined;
  }

  return new URL(
    `/avatars/thumbs/${trimmed}`,
    SLEEPER_AVATAR_ORIGIN,
  ).toString();
}

function defaultDiscoverySeasons(currentLeagueSeason: number): number[] {
  return Array.from(
    { length: DEFAULT_DISCOVERY_SEASONS },
    (_, index) => currentLeagueSeason - index,
  );
}

function normalizeSeasons(
  seasons: readonly number[] | undefined,
  currentLeagueSeason: number,
): number[] {
  const candidates =
    seasons && seasons.length > 0
      ? seasons
      : defaultDiscoverySeasons(currentLeagueSeason);

  return [...new Set(candidates)]
    .filter((season) => Number.isInteger(season) && season > 0)
    .sort((left, right) => right - left);
}

function apiUrl(path: string): string {
  return new URL(path, SLEEPER_API_ORIGIN).toString();
}

function userUrl(usernameOrUserId: string): string {
  return apiUrl(`/v1/user/${encodeURIComponent(usernameOrUserId)}`);
}

function userLeaguesUrl(userId: string, season: number): string {
  return apiUrl(`/v1/user/${encodeURIComponent(userId)}/leagues/nfl/${season}`);
}

function leagueUrl(leagueId: string): string {
  return apiUrl(`/v1/league/${encodeURIComponent(leagueId)}`);
}

function leagueRostersUrl(leagueId: string): string {
  return apiUrl(`/v1/league/${encodeURIComponent(leagueId)}/rosters`);
}

function leagueUsersUrl(leagueId: string): string {
  return apiUrl(`/v1/league/${encodeURIComponent(leagueId)}/users`);
}

function leagueMatchupsUrl(leagueId: string, week: number): string {
  return apiUrl(`/v1/league/${encodeURIComponent(leagueId)}/matchups/${week}`);
}

function leagueTransactionsUrl(leagueId: string, week: number): string {
  return apiUrl(
    `/v1/league/${encodeURIComponent(leagueId)}/transactions/${week}`,
  );
}

function nflStateUrl(): string {
  return apiUrl("/v1/state/nfl");
}

function sleeperHeaders() {
  return {
    Accept: "application/json",
    "User-Agent": SLEEPER_USER_AGENT,
  };
}

function shouldRetry(status: number): boolean {
  return status === 429 || status >= 500;
}

function retryAfterSeconds(response: Response): number | undefined {
  const header = response.headers.get("retry-after");
  if (!header) {
    return undefined;
  }

  const parsed = Number(header);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function errorForStatus(response: Response, resource: string) {
  if (response.status === 401 || response.status === 403) {
    return new AuthExpiredError(SLEEPER_PROVIDER_ID);
  }
  if (response.status === 404) {
    return new ProviderNotFoundError(SLEEPER_PROVIDER_ID, { resource });
  }
  if (response.status === 429) {
    return new RateLimitedError(
      SLEEPER_PROVIDER_ID,
      retryAfterSeconds(response),
    );
  }
  if (response.status >= 500) {
    return new ProviderBlockedError(SLEEPER_PROVIDER_ID);
  }
  return new ProviderParseError(
    SLEEPER_PROVIDER_ID,
    `Sleeper ${resource} API returned HTTP ${response.status}`,
  );
}

function normalizeSport(sport: string | undefined): "ffl" | "unknown" {
  return sport?.toLowerCase() === "nfl" ? "ffl" : "unknown";
}

function normalizeLeagueStatus(
  status: string | undefined,
): NormalizedLeague["status"] {
  switch (status?.toLowerCase()) {
    case "pre_draft":
    case "drafting":
      return "preseason";
    case "in_season":
      return "in_season";
    case "complete":
      return "complete";
    default:
      return "unknown";
  }
}

function normalizeScoringType(league: SleeperLeague): string {
  const receptionPoints = toNumber(league.scoring_settings?.rec);
  if (receptionPoints === undefined) {
    return "unknown";
  }
  if (receptionPoints === 0) {
    return "STANDARD";
  }
  if (receptionPoints === 0.5) {
    return "HALF_PPR";
  }
  if (receptionPoints === 1) {
    return "PPR";
  }
  return "CUSTOM";
}

function currentScoringPeriod(
  league: SleeperLeague,
  state?: SleeperState,
): number {
  const leagueSeason = toInteger(league.season);
  const stateLeagueSeason =
    toInteger(state?.league_season) ?? toInteger(state?.season);
  const stateWeek = toInteger(state?.display_week) ?? toInteger(state?.week);
  const lastScoredLeg = toInteger(league.settings?.last_scored_leg);

  if (leagueSeason && stateLeagueSeason && leagueSeason === stateLeagueSeason) {
    return stateWeek ?? lastScoredLeg ?? 0;
  }

  if (normalizeLeagueStatus(league.status) === "complete") {
    return (
      lastScoredLeg ??
      toInteger(league.settings?.playoff_week_start) ??
      MAX_FANTASY_WEEKS
    );
  }

  return lastScoredLeg ?? 0;
}

function normalizeLeague(
  league: SleeperLeague,
  state?: SleeperState,
): NormalizedLeague {
  const providerId = toId(league.league_id) ?? "unknown";
  const season = toInteger(league.season) ?? 0;
  const size = toInteger(league.total_rosters) ?? 0;

  return {
    provider: SLEEPER_PROVIDER_ID,
    providerId,
    season,
    sport: normalizeSport(league.sport),
    name: league.name?.trim() || `Sleeper League ${providerId}`,
    scoringType: normalizeScoringType(league),
    size,
    currentScoringPeriod: currentScoringPeriod(league, state),
    status: normalizeLeagueStatus(league.status),
  };
}

function toLeagueRef(league: SleeperLeague): ProviderLeagueRef {
  const normalized = normalizeLeague(league);
  return {
    provider: normalized.provider,
    providerId: normalized.providerId,
    season: normalized.season,
    sport: normalized.sport,
    name: normalized.name,
    size: normalized.size,
  };
}

function sleeperLeagueRef(league: SleeperLeague): ProviderLeagueRef {
  const normalized = normalizeLeague(league);
  return {
    provider: SLEEPER_PROVIDER_ID,
    providerId: normalized.providerId,
    season: normalized.season,
    sport: normalized.sport,
    name: normalized.name,
    size: normalized.size,
  };
}

function normalizeMemberDisplayName(user: SleeperLeagueUser): string {
  const displayName = user.display_name?.trim();
  if (displayName) {
    return displayName;
  }

  const username = user.username?.trim();
  if (username) {
    return username;
  }

  return `Sleeper User ${user.user_id}`;
}

function normalizeMember(
  user: SleeperLeagueUser,
  ref: ProviderLeagueRef,
): NormalizedMember {
  return {
    provider: SLEEPER_PROVIDER_ID,
    providerId: toId(user.user_id) ?? "unknown",
    leagueProviderId: ref.providerId,
    season: ref.season,
    displayName: normalizeMemberDisplayName(user),
    role: user.is_owner ? "commissioner" : "member",
  };
}

function userById(users: readonly SleeperLeagueUser[]) {
  return new Map(
    users
      .map((user) => {
        const id = toId(user.user_id);
        return id ? ([id, user] as const) : undefined;
      })
      .filter((entry): entry is readonly [string, SleeperLeagueUser] =>
        Boolean(entry),
      ),
  );
}

function fantasyPoints(
  settings: SleeperRoster["settings"],
  prefix: "fpts" | "fpts_against",
) {
  return (
    (toNumber(settings?.[prefix]) ?? 0) +
    (toNumber(settings?.[`${prefix}_decimal` as const]) ?? 0) / 100
  );
}

function normalizeTeam(
  roster: SleeperRoster,
  ref: ProviderLeagueRef,
  usersById: ReadonlyMap<string, SleeperLeagueUser>,
): NormalizedTeam {
  const providerId = String(toInteger(roster.roster_id) ?? roster.roster_id);
  const ownerId = toId(roster.owner_id);
  const owner = ownerId ? usersById.get(ownerId) : undefined;
  const coOwnerIds = (roster.co_owners ?? []).map(toId);
  const ownerMemberIds = compactUnique([ownerId, ...coOwnerIds]);
  const teamName =
    owner?.metadata?.team_name?.trim() ||
    owner?.display_name?.trim() ||
    owner?.username?.trim() ||
    `Sleeper Team ${providerId}`;
  const teamAbbrev =
    owner?.metadata?.team_abbr?.trim() || teamName.slice(0, 3).toUpperCase();
  const logo = avatarUrl(owner?.avatar);

  return {
    provider: SLEEPER_PROVIDER_ID,
    providerId,
    leagueProviderId: ref.providerId,
    season: ref.season,
    name: teamName,
    abbrev: teamAbbrev || providerId,
    ...(logo ? { logo } : {}),
    ownerMemberIds,
    record: {
      losses: toInteger(roster.settings?.losses) ?? 0,
      pointsAgainst: fantasyPoints(roster.settings, "fpts_against"),
      pointsFor: fantasyPoints(roster.settings, "fpts"),
      ties: toInteger(roster.settings?.ties) ?? 0,
      wins: toInteger(roster.settings?.wins) ?? 0,
    },
  };
}

function playerIds(values: readonly (string | number)[] | null | undefined) {
  return compactUnique((values ?? []).map(toId));
}

function matchupPoints(matchup: SleeperMatchup): number {
  return toNumber(matchup.custom_points) ?? toNumber(matchup.points) ?? 0;
}

function maxWeekForLeague(league: SleeperLeague, state?: SleeperState): number {
  const normalizedStatus = normalizeLeagueStatus(league.status);
  if (normalizedStatus === "preseason") {
    return 1;
  }
  if (normalizedStatus === "in_season") {
    return Math.max(
      1,
      Math.min(currentScoringPeriod(league, state), MAX_FANTASY_WEEKS),
    );
  }

  const playoffStart = toInteger(league.settings?.playoff_week_start);
  const lastScoredLeg = toInteger(league.settings?.last_scored_leg);
  return Math.max(
    1,
    Math.min(
      lastScoredLeg ?? (playoffStart ? playoffStart + 3 : MAX_FANTASY_WEEKS),
      MAX_FANTASY_WEEKS,
    ),
  );
}

function normalizeMatchupStatus({
  league,
  scoringPeriod,
  state,
}: {
  league: SleeperLeague;
  scoringPeriod: number;
  state?: SleeperState;
}): NormalizedMatchupStatus {
  const leagueStatus = normalizeLeagueStatus(league.status);
  const currentPeriod = currentScoringPeriod(league, state);

  if (leagueStatus === "complete" || scoringPeriod < currentPeriod) {
    return "final";
  }
  if (leagueStatus === "in_season" && scoringPeriod === currentPeriod) {
    return "in_progress";
  }
  if (leagueStatus === "preseason" || scoringPeriod > currentPeriod) {
    return "scheduled";
  }
  return "unknown";
}

function normalizeWinner(
  homeScore: number,
  awayScore: number,
  status: NormalizedMatchupStatus,
): NormalizedMatchupWinner {
  if (status !== "final") {
    return "unknown";
  }
  if (homeScore > awayScore) {
    return "home";
  }
  if (awayScore > homeScore) {
    return "away";
  }
  return "tie";
}

function normalizeMatchupsForWeek({
  league,
  matchups,
  ref,
  scoringPeriod,
  state,
}: {
  league: SleeperLeague;
  matchups: readonly SleeperMatchup[];
  ref: ProviderLeagueRef;
  scoringPeriod: number;
  state?: SleeperState;
}): NormalizedMatchup[] {
  const groups = new Map<string, SleeperMatchup[]>();
  for (const matchup of matchups) {
    const matchupId = toId(matchup.matchup_id);
    if (!matchupId) {
      continue;
    }

    const group = groups.get(matchupId) ?? [];
    group.push(matchup);
    groups.set(matchupId, group);
  }

  return [...groups.entries()]
    .flatMap(([matchupId, group]) => {
      const sides = [...group].sort((left, right) => {
        const leftRoster = toInteger(left.roster_id) ?? 0;
        const rightRoster = toInteger(right.roster_id) ?? 0;
        return leftRoster - rightRoster;
      });
      const home = sides[0];
      const away = sides[1];
      if (!home || !away) {
        return [];
      }

      const homeTeamId = String(toInteger(home.roster_id) ?? home.roster_id);
      const awayTeamId = String(toInteger(away.roster_id) ?? away.roster_id);
      const homeScore = matchupPoints(home);
      const awayScore = matchupPoints(away);
      const status = normalizeMatchupStatus({
        league,
        scoringPeriod,
        state,
      });

      const normalized: NormalizedMatchup = {
        provider: SLEEPER_PROVIDER_ID,
        providerId: `${scoringPeriod}:${matchupId}`,
        leagueProviderId: ref.providerId,
        season: ref.season,
        scoringPeriod,
        homeTeamRef: {
          provider: SLEEPER_PROVIDER_ID,
          providerId: homeTeamId,
          season: ref.season,
        },
        awayTeamRef: {
          provider: SLEEPER_PROVIDER_ID,
          providerId: awayTeamId,
          season: ref.season,
        },
        homeScore,
        awayScore,
        winner: normalizeWinner(homeScore, awayScore, status),
        status,
      };
      return [normalized];
    })
    .sort((left, right) => left.providerId.localeCompare(right.providerId));
}

function normalizeRosterEntries({
  league,
  matchup,
  roster,
}: {
  league: SleeperLeague;
  matchup?: SleeperMatchup;
  roster: SleeperRoster;
}): NormalizedRosterEntry[] {
  const players = playerIds(roster.players);
  const starters = playerIds(roster.starters);
  const reserve = new Set(playerIds(roster.reserve));
  const taxi = new Set(playerIds(roster.taxi));
  const starterIndexByPlayer = new Map(
    starters.map((playerId, index) => [playerId, index]),
  );
  const rosterPositions = league.roster_positions ?? [];

  return players.map((playerId) => {
    const starterIndex = starterIndexByPlayer.get(playerId);
    const slot =
      starterIndex === undefined
        ? reserve.has(playerId)
          ? "IR"
          : taxi.has(playerId)
            ? "TAXI"
            : "BN"
        : (rosterPositions[starterIndex] ?? "starter");
    const status =
      starterIndex === undefined
        ? reserve.has(playerId)
          ? "reserve"
          : taxi.has(playerId)
            ? "taxi"
            : "bench"
        : "active";
    const points = toNumber(matchup?.players_points?.[playerId]);

    return {
      playerRef: {
        provider: SLEEPER_PROVIDER_ID,
        providerId: playerId,
      },
      slot,
      status,
      ...(points === undefined ? {} : { points }),
    };
  });
}

function normalizeRoster({
  league,
  matchup,
  ref,
  roster,
  scoringPeriod,
}: {
  league: SleeperLeague;
  matchup?: SleeperMatchup;
  ref: ProviderLeagueRef;
  roster: SleeperRoster;
  scoringPeriod: number;
}): NormalizedRoster {
  const providerId = String(toInteger(roster.roster_id) ?? roster.roster_id);
  return {
    teamRef: {
      provider: SLEEPER_PROVIDER_ID,
      providerId,
      season: ref.season,
    },
    season: ref.season,
    scoringPeriod,
    entries: normalizeRosterEntries({ league, matchup, roster }),
  };
}

function finalStandingsFromTeams(
  teams: readonly NormalizedTeam[],
): NormalizedFinalStanding[] {
  return [...teams]
    .sort((left, right) => {
      return (
        right.record.wins - left.record.wins ||
        right.record.ties - left.record.ties ||
        right.record.pointsFor - left.record.pointsFor ||
        left.name.localeCompare(right.name) ||
        left.providerId.localeCompare(right.providerId)
      );
    })
    .map((team, index) => ({
      leagueProviderId: team.leagueProviderId,
      teamRef: {
        provider: team.provider,
        providerId: team.providerId,
        season: team.season,
      },
      rank: index + 1,
      wins: team.record.wins,
      losses: team.record.losses,
      ties: team.record.ties,
      pointsFor: team.record.pointsFor,
      pointsAgainst: team.record.pointsAgainst,
    }));
}

function normalizeTransactionType(
  transaction: SleeperTransaction,
): NormalizedTransactionType {
  switch (transaction.type?.toLowerCase()) {
    case "trade":
      return "trade";
    case "waiver":
      return "waiver";
    case "free_agent":
      return "add";
    default:
      return "unknown";
  }
}

function transactionRosterRefs(
  transaction: SleeperTransaction,
  ref: ProviderLeagueRef,
): SeasonScopedProviderEntityRef[] {
  const rosterIds = new Set<string>();
  for (const rosterId of transaction.roster_ids ?? []) {
    const normalized = toId(rosterId);
    if (normalized) {
      rosterIds.add(normalized);
    }
  }
  for (const rosterId of Object.values(transaction.adds ?? {})) {
    const normalized = toId(rosterId);
    if (normalized) {
      rosterIds.add(normalized);
    }
  }
  for (const rosterId of Object.values(transaction.drops ?? {})) {
    const normalized = toId(rosterId);
    if (normalized) {
      rosterIds.add(normalized);
    }
  }

  return [...rosterIds].sort().map((providerId) => ({
    provider: SLEEPER_PROVIDER_ID,
    providerId,
    season: ref.season,
  }));
}

function transactionPlayerRefs(
  transaction: SleeperTransaction,
): ProviderEntityRef[] {
  return compactUnique([
    ...Object.keys(transaction.adds ?? {}),
    ...Object.keys(transaction.drops ?? {}),
  ])
    .sort()
    .map((providerId) => ({
      provider: SLEEPER_PROVIDER_ID,
      providerId,
    }));
}

function transactionTimestamp(transaction: SleeperTransaction): Date {
  const millis =
    toNumber(transaction.status_updated) ?? toNumber(transaction.created) ?? 0;
  return new Date(millis);
}

function normalizeTransaction(
  transaction: SleeperTransaction,
  ref: ProviderLeagueRef,
): NormalizedTransaction {
  const providerId = toId(transaction.transaction_id) ?? "unknown";
  return {
    provider: SLEEPER_PROVIDER_ID,
    providerId,
    leagueProviderId: ref.providerId,
    season: ref.season,
    type: normalizeTransactionType(transaction),
    teamRefs: transactionRosterRefs(transaction, ref),
    playerRefs: transactionPlayerRefs(transaction),
    timestamp: transactionTimestamp(transaction),
    details: {
      creator: toId(transaction.creator) ?? null,
      status: transaction.status ?? "unknown",
      week: toInteger(transaction.leg) ?? null,
    },
  };
}

function normalizeTransactions(
  transactions: readonly SleeperTransaction[],
  ref: ProviderLeagueRef,
): NormalizedTransaction[] {
  return transactions
    .filter((transaction) => transaction.status !== "failed")
    .map((transaction) => normalizeTransaction(transaction, ref))
    .sort((left, right) => left.providerId.localeCompare(right.providerId));
}

export class SleeperClient {
  private readonly fetchImpl: SleeperFetch;
  private readonly maxAttempts: number;
  private readonly retryDelayMs: number;
  private readonly timeoutMs: number;

  constructor(options: SleeperClientOptions = {}) {
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.maxAttempts = Math.max(1, options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
    this.retryDelayMs = Math.max(
      0,
      options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS,
    );
    this.timeoutMs = Math.max(1, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  }

  async authenticate(
    credentials: SleeperCredentials,
  ): Promise<ProviderResult<SleeperSession>> {
    const usernameOrUserId = credentials.usernameOrUserId.trim();
    if (!usernameOrUserId) {
      return err(new AuthExpiredError(SLEEPER_PROVIDER_ID));
    }

    const [user, state] = await Promise.all([
      this.fetchUser(usernameOrUserId),
      this.fetchNflState(),
    ]);
    if (!user.ok) {
      if (user.error instanceof ProviderNotFoundError) {
        return err(new AuthExpiredError(SLEEPER_PROVIDER_ID, user.error));
      }
      return user;
    }
    if (!state.ok) {
      return state;
    }

    const userId = toId(user.value.user_id);
    const currentLeagueSeason =
      toInteger(state.value.league_season) ??
      toInteger(state.value.season) ??
      new Date().getUTCFullYear();
    if (!userId) {
      return err(
        new ProviderParseError(
          SLEEPER_PROVIDER_ID,
          "Sleeper User API did not include a durable user_id",
        ),
      );
    }

    return ok({
      provider: SLEEPER_PROVIDER_ID,
      authKind: "none",
      subjectProviderId: userId,
      ...(user.value.username ? { username: user.value.username } : {}),
      ...(user.value.display_name
        ? { displayName: user.value.display_name }
        : {}),
      currentLeagueSeason,
      discoverySeasons: normalizeSeasons(
        credentials.seasons,
        currentLeagueSeason,
      ),
    });
  }

  async discoverLeagues(
    session: SleeperSession,
  ): Promise<ProviderResult<ProviderLeagueRef[]>> {
    const leaguesByKey = new Map<string, ProviderLeagueRef>();

    for (const season of session.discoverySeasons) {
      const leagues = await this.fetchUserLeagues(
        session.subjectProviderId,
        season,
      );
      if (!leagues.ok) {
        return leagues;
      }

      for (const league of leagues.value) {
        const ref = toLeagueRef(league);
        if (ref.sport !== "ffl") {
          continue;
        }
        leaguesByKey.set(`${ref.season}:${ref.providerId}`, ref);
      }
    }

    return ok(
      [...leaguesByKey.values()].sort(
        (left, right) =>
          right.season - left.season || left.name.localeCompare(right.name),
      ),
    );
  }

  async getLeague(
    _session: SleeperSession,
    ref: ProviderLeagueRef,
  ): Promise<ProviderResult<NormalizedLeague>> {
    const [league, state] = await Promise.all([
      this.fetchLeague(ref.providerId),
      this.fetchNflState(),
    ]);
    if (!league.ok) {
      return league;
    }
    if (!state.ok) {
      return state;
    }

    return ok(normalizeLeague(league.value, state.value));
  }

  async getTeams(
    _session: SleeperSession,
    ref: ProviderLeagueRef,
  ): Promise<ProviderResult<NormalizedTeam[]>> {
    const [rosters, users] = await Promise.all([
      this.fetchRosters(ref.providerId),
      this.fetchLeagueUsers(ref.providerId),
    ]);
    if (!rosters.ok) {
      return rosters;
    }
    if (!users.ok) {
      return users;
    }

    const usersById = userById(users.value);
    return ok(
      rosters.value.map((roster) => normalizeTeam(roster, ref, usersById)),
    );
  }

  async getMembers(
    _session: SleeperSession,
    ref: ProviderLeagueRef,
  ): Promise<ProviderResult<NormalizedMember[]>> {
    const users = await this.fetchLeagueUsers(ref.providerId);
    if (!users.ok) {
      return users;
    }

    return ok(users.value.map((user) => normalizeMember(user, ref)));
  }

  async getRosters(
    _session: SleeperSession,
    ref: ProviderLeagueRef,
    scoringPeriod?: number,
  ): Promise<ProviderResult<NormalizedRoster[]>> {
    const [league, rosters] = await Promise.all([
      this.fetchLeague(ref.providerId),
      this.fetchRosters(ref.providerId),
    ]);
    if (!league.ok) {
      return league;
    }
    if (!rosters.ok) {
      return rosters;
    }

    let state: SleeperState | undefined;
    if (scoringPeriod === undefined) {
      const stateResult = await this.fetchNflState();
      if (!stateResult.ok) {
        return stateResult;
      }
      state = stateResult.value;
    }

    const period = scoringPeriod ?? currentScoringPeriod(league.value, state);
    let matchupsByRosterId = new Map<string, SleeperMatchup>();
    if (period > 0) {
      const matchups = await this.fetchMatchups(ref.providerId, period);
      if (!matchups.ok) {
        return matchups;
      }
      matchupsByRosterId = new Map(
        matchups.value.map((matchup) => [
          String(toInteger(matchup.roster_id) ?? matchup.roster_id),
          matchup,
        ]),
      );
    }

    return ok(
      rosters.value.map((roster) => {
        const providerId = String(
          toInteger(roster.roster_id) ?? roster.roster_id,
        );
        return normalizeRoster({
          league: league.value,
          matchup: matchupsByRosterId.get(providerId),
          ref,
          roster,
          scoringPeriod: period,
        });
      }),
    );
  }

  async getMatchups(
    _session: SleeperSession,
    ref: ProviderLeagueRef,
    scoringPeriod?: number,
  ): Promise<ProviderResult<NormalizedMatchup[]>> {
    const [league, state] = await Promise.all([
      this.fetchLeague(ref.providerId),
      this.fetchNflState(),
    ]);
    if (!league.ok) {
      return league;
    }
    if (!state.ok) {
      return state;
    }

    const weeks =
      scoringPeriod === undefined
        ? Array.from(
            { length: maxWeekForLeague(league.value, state.value) },
            (_, index) => index + 1,
          )
        : [scoringPeriod];
    const normalized: NormalizedMatchup[] = [];

    for (const week of weeks) {
      const matchups = await this.fetchMatchups(ref.providerId, week);
      if (!matchups.ok) {
        return matchups;
      }
      normalized.push(
        ...normalizeMatchupsForWeek({
          league: league.value,
          matchups: matchups.value,
          ref,
          scoringPeriod: week,
          state: state.value,
        }),
      );
    }

    return ok(normalized);
  }

  async getHistory(
    _session: SleeperSession,
    ref: ProviderLeagueRef,
    options: { seasons: number[] },
  ): Promise<ProviderResult<NormalizedSeasonBundle[]>> {
    const requestedSeasons = [...new Set(options.seasons)]
      .filter((season) => Number.isInteger(season) && season > 0)
      .sort((left, right) => right - left);
    if (requestedSeasons.length === 0) {
      return ok([]);
    }

    const seasonLeagues = await this.findLeaguesForSeasons(
      ref.providerId,
      requestedSeasons,
    );
    if (!seasonLeagues.ok) {
      return seasonLeagues;
    }

    const bundles: NormalizedSeasonBundle[] = [];
    for (const league of seasonLeagues.value) {
      const bundle = await this.buildSeasonBundle(league);
      if (!bundle.ok) {
        return bundle;
      }
      bundles.push(bundle.value);
    }

    return ok(
      bundles.sort((left, right) => right.league.season - left.league.season),
    );
  }

  private async findLeaguesForSeasons(
    startingLeagueId: string,
    requestedSeasons: readonly number[],
  ): Promise<ProviderResult<SleeperLeague[]>> {
    const requested = new Set(requestedSeasons);
    const minimumSeason = Math.min(...requestedSeasons);
    const leagues: SleeperLeague[] = [];
    const visitedLeagueIds = new Set<string>();
    let nextLeagueId: string | undefined = startingLeagueId;

    while (nextLeagueId && !visitedLeagueIds.has(nextLeagueId)) {
      visitedLeagueIds.add(nextLeagueId);
      const league = await this.fetchLeague(nextLeagueId);
      if (!league.ok) {
        return league;
      }

      const season = toInteger(league.value.season);
      if (season && requested.has(season)) {
        leagues.push(league.value);
      }
      if (
        season &&
        season < minimumSeason &&
        normalizeLeagueStatus(league.value.status) === "complete"
      ) {
        break;
      }

      nextLeagueId = toId(league.value.previous_league_id);
    }

    return ok(leagues);
  }

  private async buildSeasonBundle(
    league: SleeperLeague,
  ): Promise<ProviderResult<NormalizedSeasonBundle>> {
    const ref = sleeperLeagueRef(league);
    const [users, rosters] = await Promise.all([
      this.fetchLeagueUsers(ref.providerId),
      this.fetchRosters(ref.providerId),
    ]);
    if (!users.ok) {
      return users;
    }
    if (!rosters.ok) {
      return rosters;
    }

    const teams = rosters.value.map((roster) =>
      normalizeTeam(roster, ref, userById(users.value)),
    );
    const members = users.value.map((user) => normalizeMember(user, ref));
    const matchups = await this.fetchAllNormalizedMatchups({
      league,
      ref,
    });
    if (!matchups.ok) {
      return matchups;
    }
    const transactions = await this.fetchAllNormalizedTransactions({
      league,
      ref,
    });
    if (!transactions.ok) {
      return transactions;
    }

    return ok({
      league: normalizeLeague(league),
      teams,
      members,
      matchups: matchups.value,
      finalStandings: finalStandingsFromTeams(teams),
      transactions: transactions.value,
    });
  }

  private async fetchAllNormalizedMatchups({
    league,
    ref,
  }: {
    league: SleeperLeague;
    ref: ProviderLeagueRef;
  }): Promise<ProviderResult<NormalizedMatchup[]>> {
    const normalized: NormalizedMatchup[] = [];
    for (let week = 1; week <= maxWeekForLeague(league); week += 1) {
      const matchups = await this.fetchMatchups(ref.providerId, week);
      if (!matchups.ok) {
        return matchups;
      }
      normalized.push(
        ...normalizeMatchupsForWeek({
          league,
          matchups: matchups.value,
          ref,
          scoringPeriod: week,
        }),
      );
    }

    return ok(normalized);
  }

  private async fetchAllNormalizedTransactions({
    league,
    ref,
  }: {
    league: SleeperLeague;
    ref: ProviderLeagueRef;
  }): Promise<ProviderResult<NormalizedTransaction[]>> {
    const transactions: NormalizedTransaction[] = [];
    for (let week = 1; week <= maxWeekForLeague(league); week += 1) {
      const weekTransactions = await this.fetchTransactions(
        ref.providerId,
        week,
      );
      if (!weekTransactions.ok) {
        return weekTransactions;
      }
      transactions.push(...normalizeTransactions(weekTransactions.value, ref));
    }

    return ok(
      transactions.sort((left, right) =>
        left.providerId.localeCompare(right.providerId),
      ),
    );
  }

  private async fetchUser(
    usernameOrUserId: string,
  ): Promise<ProviderResult<SleeperUser>> {
    return this.fetchJson(userUrl(usernameOrUserId), sleeperUserSchema, "user");
  }

  private async fetchNflState(): Promise<ProviderResult<SleeperState>> {
    return this.fetchJson(nflStateUrl(), sleeperStateSchema, "nfl-state");
  }

  private async fetchUserLeagues(
    userId: string,
    season: number,
  ): Promise<ProviderResult<SleeperLeague[]>> {
    return this.fetchJson(
      userLeaguesUrl(userId, season),
      sleeperLeagueListSchema,
      "user-leagues",
    );
  }

  private async fetchLeague(
    leagueId: string,
  ): Promise<ProviderResult<SleeperLeague>> {
    return this.fetchJson(leagueUrl(leagueId), sleeperLeagueSchema, "league");
  }

  private async fetchRosters(
    leagueId: string,
  ): Promise<ProviderResult<SleeperRoster[]>> {
    return this.fetchJson(
      leagueRostersUrl(leagueId),
      sleeperRosterListSchema,
      "league-rosters",
    );
  }

  private async fetchLeagueUsers(
    leagueId: string,
  ): Promise<ProviderResult<SleeperLeagueUser[]>> {
    return this.fetchJson(
      leagueUsersUrl(leagueId),
      sleeperLeagueUserListSchema,
      "league-users",
    );
  }

  private async fetchMatchups(
    leagueId: string,
    scoringPeriod: number,
  ): Promise<ProviderResult<SleeperMatchup[]>> {
    return this.fetchJson(
      leagueMatchupsUrl(leagueId, scoringPeriod),
      sleeperMatchupListSchema,
      "league-matchups",
    );
  }

  private async fetchTransactions(
    leagueId: string,
    scoringPeriod: number,
  ): Promise<ProviderResult<SleeperTransaction[]>> {
    return this.fetchJson(
      leagueTransactionsUrl(leagueId, scoringPeriod),
      sleeperTransactionListSchema,
      "league-transactions",
    );
  }

  private async fetchJson<T>(
    url: string,
    schema: z.ZodType<T>,
    resource: string,
  ): Promise<ProviderResult<T>> {
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        const response = await this.fetchImpl(url, {
          cache: "no-store",
          headers: sleeperHeaders(),
          method: "GET",
          signal: AbortSignal.timeout(this.timeoutMs),
        });

        if (response.ok) {
          return await parseJson(response, schema, resource);
        }

        const providerError = errorForStatus(response, resource);
        if (!shouldRetry(response.status) || attempt >= this.maxAttempts) {
          return err(providerError);
        }
      } catch (cause) {
        if (attempt >= this.maxAttempts) {
          return err(new ProviderBlockedError(SLEEPER_PROVIDER_ID, cause));
        }
      }

      await this.waitBeforeRetry(attempt);
    }

    return err(new ProviderBlockedError(SLEEPER_PROVIDER_ID));
  }

  private async waitBeforeRetry(attempt: number): Promise<void> {
    if (!this.retryDelayMs) {
      return;
    }

    const delayMs = this.retryDelayMs * 2 ** (attempt - 1);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

async function parseJson<T>(
  response: Response,
  schema: z.ZodType<T>,
  resource: string,
): Promise<ProviderResult<T>> {
  try {
    const json = (await response.json()) as unknown;
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      return err(
        new ProviderParseError(
          SLEEPER_PROVIDER_ID,
          `Sleeper ${resource} API returned an unexpected shape`,
          parsed.error,
        ),
      );
    }
    return ok(parsed.data);
  } catch (cause) {
    return err(
      new ProviderParseError(
        SLEEPER_PROVIDER_ID,
        `Sleeper ${resource} API response was not valid JSON`,
        cause,
      ),
    );
  }
}

export function createSleeperClient(
  options?: SleeperClientOptions,
): SleeperClient {
  return new SleeperClient(options);
}

export function createSleeperProvider(
  options?: SleeperClientOptions,
): SleeperProvider {
  const client = createSleeperClient(options);
  return {
    id: SLEEPER_PROVIDER_ID,
    name: "Sleeper Fantasy Football",
    capabilities: SLEEPER_PROVIDER_CAPABILITIES,
    authenticate: (credentials) => client.authenticate(credentials),
    discoverLeagues: (session) => client.discoverLeagues(session),
    getHistory: (session, ref, options) =>
      client.getHistory(session, ref, options),
    getLeague: (session, ref) => client.getLeague(session, ref),
    getMatchups: (session, ref, scoringPeriod) =>
      client.getMatchups(session, ref, scoringPeriod),
    getMembers: (session, ref) => client.getMembers(session, ref),
    getRosters: (session, ref, scoringPeriod) =>
      client.getRosters(session, ref, scoringPeriod),
    getTeams: (session, ref) => client.getTeams(session, ref),
  };
}
