import { z } from "zod";
import { err, ok } from "@/core/result";
import {
  AuthExpiredError,
  type FantasyProvider,
  type FantasyProviderCapabilities,
  type FantasyProviderSession,
  type NormalizedDraftPick,
  type NormalizedFinalStanding,
  type NormalizedKeeperSettings,
  type NormalizedLeague,
  type NormalizedMatchup,
  type NormalizedMatchupStatus,
  type NormalizedMatchupWinner,
  type NormalizedMember,
  type NormalizedPlayer,
  type NormalizedPostseasonSettings,
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
import {
  isFixtureSleeperCredential,
  isFixtureSleeperSession,
} from "./fixture-values";
import {
  createSleeperPlayerCatalog,
  type SleeperCatalogPlayer,
  type SleeperPlayerCatalog,
} from "./player-catalog";
import {
  decodeSleeperPosition,
  decodeSleeperProTeam,
  decodeSleeperRosterSlot,
  encodeSleeperPosition,
  encodeSleeperProTeam,
  encodeSleeperRosterSlot,
  encodeSleeperScoringSetting,
  encodeSleeperTransactionType,
} from "./reference-data";

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
  playerCatalog?: SleeperPlayerCatalog;
  playerCatalogCacheFilePath?: string;
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
const IDP_ROSTER_POSITIONS = new Set([
  "CB",
  "DB",
  "DE",
  "DL",
  "DT",
  "EDR",
  "IDP",
  "LB",
  "S",
]);

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
const nullableBooleanValue = z
  .union([z.boolean(), z.number(), z.string()])
  .nullable();
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
        playoff_teams: numericValue.optional(),
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

const sleeperDraftSchema = z
  .object({
    draft_id: idValue,
    league_id: idValue.optional(),
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),
    season: numericValue.optional(),
    settings: z
      .object({
        rounds: numericValue.optional(),
        teams: numericValue.optional(),
      })
      .catchall(z.unknown())
      .optional(),
    sport: z.string().optional(),
    status: z.string().optional(),
    type: z.string().optional(),
  })
  .passthrough();

const sleeperDraftListSchema = z.array(sleeperDraftSchema);

const sleeperDraftPickSchema = z
  .object({
    draft_id: idValue,
    draft_slot: numericValue.optional(),
    is_keeper: nullableBooleanValue.optional(),
    metadata: z
      .object({
        first_name: nullableString,
        last_name: nullableString,
        player_id: nullableIdValue.optional(),
        position: nullableString,
        status: nullableString,
        team: nullableString,
      })
      .catchall(z.unknown())
      .nullable()
      .optional(),
    pick_no: numericValue,
    picked_by: nullableIdValue.optional(),
    player_id: nullableIdValue.optional(),
    roster_id: nullableNumericValue,
    round: numericValue,
  })
  .passthrough();

const sleeperDraftPickListSchema = z.array(sleeperDraftPickSchema);

const sleeperBracketMatchSchema = z
  .object({
    l: nullableNumericValue.optional(),
    m: numericValue.optional(),
    p: nullableNumericValue.optional(),
    r: numericValue.optional(),
    w: nullableNumericValue.optional(),
  })
  .passthrough();

const sleeperBracketSchema = z.array(sleeperBracketMatchSchema);

type SleeperBracketMatch = z.infer<typeof sleeperBracketMatchSchema>;
type SleeperDraft = z.infer<typeof sleeperDraftSchema>;
type SleeperDraftPick = z.infer<typeof sleeperDraftPickSchema>;
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

function leagueDraftsUrl(leagueId: string): string {
  return apiUrl(`/v1/league/${encodeURIComponent(leagueId)}/drafts`);
}

function draftPicksUrl(draftId: string): string {
  return apiUrl(`/v1/draft/${encodeURIComponent(draftId)}/picks`);
}

function leagueWinnersBracketUrl(leagueId: string): string {
  return apiUrl(`/v1/league/${encodeURIComponent(leagueId)}/winners_bracket`);
}

function leagueLosersBracketUrl(leagueId: string): string {
  return apiUrl(`/v1/league/${encodeURIComponent(leagueId)}/losers_bracket`);
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function numberSetting(
  settings: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = settings[key];
  return typeof value === "number" || typeof value === "string"
    ? toNumber(value)
    : undefined;
}

function booleanSetting(
  settings: Record<string, unknown>,
  key: string,
): boolean | undefined {
  const value = settings[key];
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value > 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes"].includes(normalized)) {
      return true;
    }
    if (["0", "false", "no"].includes(normalized)) {
      return false;
    }
  }
  return undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value === 1 ? true : value === 0 ? false : undefined;
  }
  if (typeof value === "string") {
    switch (value.trim().toLowerCase()) {
      case "1":
      case "true":
      case "yes":
        return true;
      case "0":
      case "false":
      case "no":
        return false;
      default:
        return undefined;
    }
  }
  return undefined;
}

function normalizeScoringSettings(
  league: SleeperLeague,
): Record<string, unknown> {
  const scoringSettings = isPlainObject(league.scoring_settings)
    ? league.scoring_settings
    : {};
  const rosterPositions = league.roster_positions ?? [];
  const scoringItems = Object.entries(scoringSettings)
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([key, value]) => {
      const points =
        typeof value === "number" || typeof value === "string"
          ? toNumber(value)
          : undefined;
      const statId = encodeSleeperScoringSetting(key);
      return points === undefined || statId === undefined
        ? []
        : [{ points, statId, statKey: key }];
    });
  return {
    ...scoringSettings,
    idp: rosterPositions.some((position) =>
      IDP_ROSTER_POSITIONS.has(position.toUpperCase()),
    ),
    rosterPositions,
    scoringItems,
  };
}

function normalizeRosterSettings(
  league: SleeperLeague,
): { lineupSlotCounts: Record<string, number>; source: string } | undefined {
  const slotCounts = new Map<number, number>();
  for (const slot of league.roster_positions ?? []) {
    const slotId = encodeSleeperRosterSlot(slot);
    if (slotId !== undefined) {
      slotCounts.set(slotId, (slotCounts.get(slotId) ?? 0) + 1);
    }
  }
  if (slotCounts.size === 0) return undefined;

  return {
    lineupSlotCounts: Object.fromEntries(
      [...slotCounts.entries()]
        .sort(([left], [right]) => left - right)
        .map(([slotId, count]) => [String(slotId), count]),
    ),
    source: "sleeper.league.roster_positions",
  };
}

function normalizeKeeperSettings(
  league: SleeperLeague,
): NormalizedKeeperSettings | undefined {
  const settings = isPlainObject(league.settings) ? league.settings : {};
  const leagueType = numberSetting(settings, "type");
  const keeperCount =
    numberSetting(settings, "keeper_count") ??
    numberSetting(settings, "keepers") ??
    numberSetting(settings, "num_keepers");
  const isDynasty =
    leagueType === 2 ||
    booleanSetting(settings, "dynasty") === true ||
    String(settings.type ?? "").toLowerCase() === "dynasty";
  const isKeeper =
    isDynasty ||
    (keeperCount ?? 0) > 0 ||
    booleanSetting(settings, "keeper") === true;

  if (!isKeeper && !isDynasty && keeperCount === undefined) {
    return undefined;
  }

  return {
    isDynasty,
    isKeeper,
    ...(keeperCount === undefined ? {} : { keeperCount }),
    source: "sleeper.settings",
  };
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

function positiveInteger(
  value: string | number | null | undefined,
): number | undefined {
  const parsed = toInteger(value);
  return parsed && parsed > 0 ? parsed : undefined;
}

function normalizePostseasonSettings(
  league: SleeperLeague,
): NormalizedPostseasonSettings | undefined {
  const rawSettings = isPlainObject(league.settings) ? league.settings : {};
  const playoffStart = positiveInteger(league.settings?.playoff_week_start);
  const playoffTeamCount = positiveInteger(
    numberSetting(rawSettings, "playoff_teams"),
  );
  const lastScoredLeg = positiveInteger(league.settings?.last_scored_leg);
  const isComplete = normalizeLeagueStatus(league.status) === "complete";
  const championshipScoringPeriod =
    isComplete &&
    lastScoredLeg &&
    (!playoffStart || lastScoredLeg >= playoffStart)
      ? lastScoredLeg
      : undefined;
  const settings: NormalizedPostseasonSettings = {
    ...(playoffTeamCount ? { playoffTeamCount } : {}),
    ...(playoffStart
      ? {
          playoffStartScoringPeriod: playoffStart,
          ...(playoffStart > 1
            ? { regularSeasonEndScoringPeriod: playoffStart - 1 }
            : {}),
        }
      : {}),
    ...(championshipScoringPeriod ? { championshipScoringPeriod } : {}),
  };

  return Object.keys(settings).length > 0 ? settings : undefined;
}

function normalizeLeague(
  league: SleeperLeague,
  state?: SleeperState,
): NormalizedLeague {
  const providerId = toId(league.league_id) ?? "unknown";
  const season = toInteger(league.season) ?? 0;
  const size = toInteger(league.total_rosters) ?? 0;
  const postseason = normalizePostseasonSettings(league);
  const keeperSettings = normalizeKeeperSettings(league);
  const rosterSettings = normalizeRosterSettings(league);

  return {
    provider: SLEEPER_PROVIDER_ID,
    providerId,
    season,
    sport: normalizeSport(league.sport),
    name: league.name?.trim() || `Sleeper League ${providerId}`,
    scoringType: normalizeScoringType(league),
    scoringSettings: normalizeScoringSettings(league),
    ...(rosterSettings ? { rosterSettings } : {}),
    size,
    currentScoringPeriod: currentScoringPeriod(league, state),
    status: normalizeLeagueStatus(league.status),
    ...(keeperSettings ? { keeperSettings } : {}),
    ...(postseason ? { postseason } : {}),
  };
}

function toLeagueRef(league: SleeperLeague): ProviderLeagueRef {
  const normalized = normalizeLeague(league);
  const previousProviderId = toId(league.previous_league_id);
  return {
    provider: normalized.provider,
    providerId: normalized.providerId,
    season: normalized.season,
    sport: normalized.sport,
    name: normalized.name,
    size: normalized.size,
    ...(previousProviderId ? { previousProviderId } : {}),
  };
}

function sleeperLeagueRef(league: SleeperLeague): ProviderLeagueRef {
  const normalized = normalizeLeague(league);
  const previousProviderId = toId(league.previous_league_id);
  return {
    provider: SLEEPER_PROVIDER_ID,
    providerId: normalized.providerId,
    season: normalized.season,
    sport: normalized.sport,
    name: normalized.name,
    size: normalized.size,
    ...(previousProviderId ? { previousProviderId } : {}),
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

function rosterProviderId(roster: SleeperRoster): string {
  return String(toInteger(roster.roster_id) ?? roster.roster_id);
}

function rosterOwnerMemberIds(roster: SleeperRoster): string[] {
  return compactUnique([
    toId(roster.owner_id),
    ...(roster.co_owners ?? []).map(toId),
  ]);
}

function normalizeTeam(
  roster: SleeperRoster,
  ref: ProviderLeagueRef,
  usersById: ReadonlyMap<string, SleeperLeagueUser>,
): NormalizedTeam {
  const providerId = rosterProviderId(roster);
  const ownerMemberIds = rosterOwnerMemberIds(roster);
  const ownerId = ownerMemberIds[0];
  const owner = ownerId ? usersById.get(ownerId) : undefined;
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
  return compactUnique((values ?? []).map(toId)).filter(
    (playerId) => playerId !== "0",
  );
}

function normalizedSleeperPlayer({
  catalogPlayer,
  playerId,
  ref,
}: {
  catalogPlayer?: SleeperCatalogPlayer;
  playerId: string;
  ref: ProviderLeagueRef;
}): NormalizedPlayer {
  // Sleeper represents NFL team defenses with the team abbreviation itself as
  // the durable player id (for example "ARI"). Preserve that real id verbatim,
  // just as ESPN preserves its negative D/ST ids, and synthesize catalog depth
  // only when the large player dump omits the team row.
  const defenseTeam =
    catalogPlayer === undefined && playerId !== "FA"
      ? decodeSleeperProTeam(playerId)
      : undefined;
  const resolvedPlayer =
    catalogPlayer ??
    (defenseTeam
      ? {
          active: true,
          fantasyPositions: ["DEF"],
          fullName: `${defenseTeam} D/ST`,
          playerId,
          position: "DEF",
          proTeam: defenseTeam,
          status: "Active",
        }
      : undefined);
  const rawPosition =
    resolvedPlayer?.position ??
    resolvedPlayer?.fantasyPositions[0] ??
    "CATALOG_MISSING";
  const rawProTeam = resolvedPlayer?.proTeam;
  const positionId = encodeSleeperPosition(rawPosition);
  const proTeamId = rawProTeam ? encodeSleeperProTeam(rawProTeam) : undefined;
  const eligibleSlotCodes = resolvedPlayer?.fantasyPositions ?? [];
  const eligibleSlots = eligibleSlotCodes
    .map(encodeSleeperRosterSlot)
    .filter((slotId): slotId is number => slotId !== undefined);
  const position = decodeSleeperPosition(rawPosition) ?? "unknown";
  const proTeam = rawProTeam
    ? (decodeSleeperProTeam(rawProTeam) ?? "unknown")
    : undefined;
  const isTeamDefense = position === "DEF";
  const catalogSource = catalogPlayer
    ? "sleeper.players.nfl"
    : defenseTeam
      ? "sleeper.team-defense-id"
      : "sleeper.players.nfl.missing";

  return {
    provider: SLEEPER_PROVIDER_ID,
    providerId: playerId,
    leagueProviderId: ref.providerId,
    fullName: resolvedPlayer?.fullName ?? `Sleeper Player ${playerId}`,
    position,
    ...(proTeam ? { proTeam } : {}),
    ...(resolvedPlayer?.status
      ? { status: resolvedPlayer.status }
      : resolvedPlayer?.active === undefined
        ? {}
        : { status: resolvedPlayer.active ? "Active" : "Inactive" }),
    metadata: {
      catalogMissing: resolvedPlayer === undefined,
      catalogSource,
      ...(positionId === undefined ? {} : { defaultPositionId: positionId }),
      eligibleSlotLabels: eligibleSlotCodes.map(
        (slot) => decodeSleeperRosterSlot(slot) ?? "unknown",
      ),
      eligibleSlots,
      ...(isTeamDefense
        ? { defenseProviderIdConvention: "nfl_team_code", isTeamDefense: true }
        : {}),
      ...(proTeamId === undefined ? {} : { proTeamId }),
      rawPosition,
      ...(rawProTeam ? { rawProTeam } : {}),
    },
  };
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
  playerCatalog,
  ref,
  roster,
}: {
  league: SleeperLeague;
  matchup?: SleeperMatchup;
  playerCatalog: ReadonlyMap<string, SleeperCatalogPlayer>;
  ref: ProviderLeagueRef;
  roster: SleeperRoster;
}): NormalizedRosterEntry[] {
  const players = compactUnique([
    ...playerIds(matchup?.players ?? roster.players),
    ...Object.keys(matchup?.players_points ?? {}),
  ]).filter((playerId) => playerId !== "0");
  const starterValues = matchup?.starters ?? roster.starters ?? [];
  const reserve = new Set(playerIds(roster.reserve));
  const taxi = new Set(playerIds(roster.taxi));
  const starterIndexByPlayer = new Map<string, number>(
    starterValues.flatMap((value, index) => {
      const playerId = toId(value);
      return playerId && playerId !== "0" ? ([[playerId, index]] as const) : [];
    }),
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
        : (rosterPositions[starterIndex] ?? "UNKNOWN_STARTER");
    const normalizedSlot = decodeSleeperRosterSlot(slot) ?? "unknown";
    const status =
      starterIndex === undefined
        ? reserve.has(playerId)
          ? "reserve"
          : taxi.has(playerId)
            ? "taxi"
            : "bench"
        : "active";
    const points = toNumber(matchup?.players_points?.[playerId]);
    const lineupSlotId = encodeSleeperRosterSlot(slot);

    return {
      ...(points === undefined ? {} : { actualPoints: points }),
      player: normalizedSleeperPlayer({
        catalogPlayer: playerCatalog.get(playerId),
        playerId,
        ref,
      }),
      playerRef: {
        provider: SLEEPER_PROVIDER_ID,
        providerId: playerId,
      },
      slot: normalizedSlot,
      started: starterIndex !== undefined,
      status,
      ...(points === undefined ? {} : { points }),
      ...(lineupSlotId === undefined
        ? {}
        : {
            metadata: {
              lineupSlotId,
              lineupSlotLabel: normalizedSlot,
              rawLineupSlot: slot,
            },
          }),
    };
  });
}

function normalizeRoster({
  league,
  matchup,
  playerCatalog,
  ref,
  roster,
  scoringPeriod,
}: {
  league: SleeperLeague;
  matchup?: SleeperMatchup;
  playerCatalog: ReadonlyMap<string, SleeperCatalogPlayer>;
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
    entries: normalizeRosterEntries({
      league,
      matchup,
      playerCatalog,
      ref,
      roster,
    }),
  };
}

function normalizedPlayersFromRosters(
  rosters: readonly NormalizedRoster[],
): NormalizedPlayer[] {
  const players = new Map<string, NormalizedPlayer>();
  for (const roster of rosters) {
    for (const entry of roster.entries) {
      if (entry.player) {
        players.set(entry.player.providerId, entry.player);
      }
    }
  }
  return [...players.values()].sort((left, right) =>
    left.providerId.localeCompare(right.providerId, undefined, {
      numeric: true,
    }),
  );
}

function catalogPlayerFromDraftPick(
  pick: SleeperDraftPick,
  playerId: string,
): SleeperCatalogPlayer | undefined {
  const rawPosition = pick.metadata?.position?.trim();
  const fullName = compactUnique([
    pick.metadata?.first_name,
    pick.metadata?.last_name,
  ]).join(" ");
  if (!rawPosition || !fullName) {
    return undefined;
  }

  const status = pick.metadata?.status?.trim();
  const proTeam = pick.metadata?.team?.trim();
  return {
    fantasyPositions: [rawPosition],
    fullName,
    playerId,
    position: rawPosition,
    ...(proTeam ? { proTeam } : {}),
    ...(status ? { active: status.toLowerCase() === "active", status } : {}),
  };
}

function normalizeDraftPick({
  draft,
  pick,
  playerCatalog,
  ref,
}: {
  draft: SleeperDraft;
  pick: SleeperDraftPick;
  playerCatalog: ReadonlyMap<string, SleeperCatalogPlayer>;
  ref: ProviderLeagueRef;
}): NormalizedDraftPick | undefined {
  const draftId = toId(draft.draft_id);
  const pickOverall = positiveInteger(pick.pick_no);
  const rosterId = toId(pick.roster_id);
  const round = positiveInteger(pick.round);
  if (!draftId || !pickOverall || !rosterId || !round) {
    return undefined;
  }

  const teamCount = positiveInteger(draft.settings?.teams);
  const draftSlot = positiveInteger(pick.draft_slot);
  const pickInRound = teamCount
    ? ((pickOverall - 1) % teamCount) + 1
    : draftSlot;
  const playerId =
    toId(pick.player_id) ?? toId(pick.metadata?.player_id ?? undefined);
  const catalogPlayer = playerId
    ? (playerCatalog.get(playerId) ??
      catalogPlayerFromDraftPick(pick, playerId))
    : undefined;
  const isKeeper = booleanValue(pick.is_keeper);
  const player =
    playerId && catalogPlayer
      ? normalizedSleeperPlayer({ catalogPlayer, playerId, ref })
      : undefined;

  return {
    provider: SLEEPER_PROVIDER_ID,
    providerId: `${draftId}:${pickOverall}`,
    leagueProviderId: ref.providerId,
    season: ref.season,
    round,
    pickOverall,
    ...(pickInRound ? { pickInRound } : {}),
    teamRef: {
      provider: SLEEPER_PROVIDER_ID,
      providerId: rosterId,
      season: ref.season,
    },
    ...(playerId
      ? {
          playerRef: {
            provider: SLEEPER_PROVIDER_ID,
            providerId: playerId,
          },
        }
      : {}),
    ...(player ? { player } : {}),
    ...(isKeeper === undefined ? {} : { isKeeper }),
    metadata: {
      draftId,
      ...(draftSlot ? { draftSlot } : {}),
      ...(draft.status ? { draftStatus: draft.status } : {}),
      ...(draft.type ? { draftType: draft.type } : {}),
      ...(toId(pick.picked_by) ? { pickedBy: toId(pick.picked_by) } : {}),
    },
  };
}

function normalizeDraftPicks({
  draftsWithPicks,
  playerCatalog,
  ref,
}: {
  draftsWithPicks: readonly {
    draft: SleeperDraft;
    picks: readonly SleeperDraftPick[];
  }[];
  playerCatalog: ReadonlyMap<string, SleeperCatalogPlayer>;
  ref: ProviderLeagueRef;
}): NormalizedDraftPick[] {
  return draftsWithPicks
    .flatMap(({ draft, picks }) =>
      picks.flatMap((pick) => {
        const normalized = normalizeDraftPick({
          draft,
          pick,
          playerCatalog,
          ref,
        });
        return normalized ? [normalized] : [];
      }),
    )
    .sort(
      (left, right) =>
        left.providerId.localeCompare(right.providerId, undefined, {
          numeric: true,
        }) || (left.pickOverall ?? 0) - (right.pickOverall ?? 0),
    );
}

function sortedTeamsByRegularSeason(
  teams: readonly NormalizedTeam[],
): NormalizedTeam[] {
  return [...teams].sort((left, right) => {
    return (
      right.record.wins - left.record.wins ||
      right.record.ties - left.record.ties ||
      right.record.pointsFor - left.record.pointsFor ||
      left.name.localeCompare(right.name) ||
      left.providerId.localeCompare(right.providerId)
    );
  });
}

function bracketPlacements(
  bracket: readonly SleeperBracketMatch[],
  rankOffset: number,
): { rank: number; teamProviderId: string }[] {
  return bracket.flatMap((matchup) => {
    const placement = positiveInteger(matchup.p);
    const winner = toId(matchup.w);
    const loser = toId(matchup.l);
    if (!placement || !winner || !loser) {
      return [];
    }
    return [
      { rank: rankOffset + placement, teamProviderId: winner },
      { rank: rankOffset + placement + 1, teamProviderId: loser },
    ];
  });
}

function finalStandingsFromTeams(
  teams: readonly NormalizedTeam[],
  options: {
    losersBracket?: readonly SleeperBracketMatch[];
    playoffTeamCount?: number;
    winnersBracket?: readonly SleeperBracketMatch[];
  } = {},
): NormalizedFinalStanding[] {
  const regularSeasonOrder = sortedTeamsByRegularSeason(teams);
  const winnersPlacements = bracketPlacements(options.winnersBracket ?? [], 0);
  const inferredPlayoffTeamCount = winnersPlacements.reduce(
    (maximum, placement) => Math.max(maximum, placement.rank),
    0,
  );
  const playoffTeamCount = options.playoffTeamCount ?? inferredPlayoffTeamCount;
  const reportedPlacements = [
    ...winnersPlacements,
    ...bracketPlacements(options.losersBracket ?? [], playoffTeamCount),
  ].filter(
    ({ rank, teamProviderId }) =>
      rank <= teams.length &&
      teams.some((team) => team.providerId === teamProviderId),
  );
  const reportedRankByTeam = new Map<string, number>();
  const usedRanks = new Set<number>();
  for (const { rank, teamProviderId } of reportedPlacements) {
    if (reportedRankByTeam.has(teamProviderId) || usedRanks.has(rank)) {
      continue;
    }
    reportedRankByTeam.set(teamProviderId, rank);
    usedRanks.add(rank);
  }
  const fallbackRanks = Array.from(
    { length: teams.length },
    (_, index) => index + 1,
  ).filter((rank) => !usedRanks.has(rank));
  const rankByTeam = new Map(reportedRankByTeam);
  for (const team of regularSeasonOrder) {
    if (!rankByTeam.has(team.providerId)) {
      const rank = fallbackRanks.shift();
      if (rank !== undefined) {
        rankByTeam.set(team.providerId, rank);
      }
    }
  }

  return regularSeasonOrder
    .map(
      (team): NormalizedFinalStanding => ({
        leagueProviderId: team.leagueProviderId,
        teamRef: {
          provider: team.provider,
          providerId: team.providerId,
          season: team.season,
        },
        rank: rankByTeam.get(team.providerId) ?? teams.length,
        rankConfidence: reportedRankByTeam.has(team.providerId)
          ? "high"
          : "low",
        rankSource: reportedRankByTeam.has(team.providerId)
          ? "provider_calculated_final"
          : "regular_season_fallback",
        wins: team.record.wins,
        losses: team.record.losses,
        ties: team.record.ties,
        pointsFor: team.record.pointsFor,
        pointsAgainst: team.record.pointsAgainst,
      }),
    )
    .sort(
      (left, right) =>
        left.rank - right.rank ||
        left.teamRef.providerId.localeCompare(right.teamRef.providerId),
    );
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
  const rawType = transaction.type?.trim();
  const rawTypeId = rawType ? encodeSleeperTransactionType(rawType) : undefined;
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
      ...(rawType ? { rawTransactionType: rawType } : {}),
      ...(rawTypeId === undefined ? {} : { rawType: rawTypeId }),
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
  private readonly playerCatalog: SleeperPlayerCatalog;
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
    this.playerCatalog =
      options.playerCatalog ??
      createSleeperPlayerCatalog({
        ...(options.playerCatalogCacheFilePath
          ? { cacheFilePath: options.playerCatalogCacheFilePath }
          : {}),
        fetch: this.fetchImpl,
        timeoutMs: this.timeoutMs,
      });
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
        const rosters = await this.fetchRosters(ref.providerId);
        if (!rosters.ok) {
          return rosters;
        }
        const selfRoster = rosters.value.find((roster) =>
          rosterOwnerMemberIds(roster).includes(session.subjectProviderId),
        );
        leaguesByKey.set(`${ref.season}:${ref.providerId}`, {
          ...ref,
          ...(selfRoster
            ? { providerTeamId: rosterProviderId(selfRoster) }
            : {}),
        });
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
    const playerCatalog = await this.playerCatalog.load();
    if (!playerCatalog.ok) {
      return playerCatalog;
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
          playerCatalog: playerCatalog.value,
          ref,
          roster,
          scoringPeriod: period,
        });
      }),
    );
  }

  async getDraftPicks(
    _session: SleeperSession,
    ref: ProviderLeagueRef,
  ): Promise<ProviderResult<NormalizedDraftPick[]>> {
    const playerCatalog = await this.playerCatalog.load();
    if (!playerCatalog.ok) {
      return playerCatalog;
    }
    return this.loadDraftPicks(ref, playerCatalog.value);
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

  async getTransactions(
    _session: SleeperSession,
    ref: ProviderLeagueRef,
    scoringPeriod?: number,
  ): Promise<ProviderResult<NormalizedTransaction[]>> {
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

    const period =
      scoringPeriod ?? currentScoringPeriod(league.value, state.value);
    if (period <= 0) {
      return ok([]);
    }

    const transactions = await this.fetchTransactions(ref.providerId, period);
    if (!transactions.ok) {
      return transactions;
    }

    return ok(normalizeTransactions(transactions.value, ref));
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
    const [users, rosters, playerCatalog] = await Promise.all([
      this.fetchLeagueUsers(ref.providerId),
      this.fetchRosters(ref.providerId),
      this.playerCatalog.load(),
    ]);
    if (!users.ok) {
      return users;
    }
    if (!rosters.ok) {
      return rosters;
    }
    if (!playerCatalog.ok) {
      return playerCatalog;
    }

    const teams = rosters.value.map((roster) =>
      normalizeTeam(roster, ref, userById(users.value)),
    );
    const members = users.value.map((user) => normalizeMember(user, ref));
    const weeklyDepth = await this.fetchAllNormalizedMatchupsAndRosters({
      league,
      playerCatalog: playerCatalog.value,
      ref,
      rosterRows: rosters.value,
    });
    if (!weeklyDepth.ok) {
      return weeklyDepth;
    }
    const transactions = await this.fetchAllNormalizedTransactions({
      league,
      ref,
    });
    if (!transactions.ok) {
      return transactions;
    }
    const draftPicks = await this.loadDraftPicks(ref, playerCatalog.value);
    if (!draftPicks.ok) {
      return draftPicks;
    }
    const finalStandings = await this.fetchFinalStandings(league, teams);
    if (!finalStandings.ok) {
      return finalStandings;
    }

    return ok({
      league: normalizeLeague(league),
      teams,
      members,
      matchups: weeklyDepth.value.matchups,
      finalStandings: finalStandings.value,
      players: normalizedPlayersFromRosters(weeklyDepth.value.rosters),
      rosters: weeklyDepth.value.rosters,
      draftPicks: draftPicks.value,
      transactions: transactions.value,
    });
  }

  private async loadDraftPicks(
    ref: ProviderLeagueRef,
    playerCatalog: ReadonlyMap<string, SleeperCatalogPlayer>,
  ): Promise<ProviderResult<NormalizedDraftPick[]>> {
    const drafts = await this.fetchDrafts(ref.providerId);
    if (!drafts.ok) {
      return drafts;
    }

    const draftsWithPicks: {
      draft: SleeperDraft;
      picks: SleeperDraftPick[];
    }[] = [];
    for (const draft of drafts.value) {
      const draftId = toId(draft.draft_id);
      if (!draftId) {
        continue;
      }
      const picks = await this.fetchDraftPicks(draftId);
      if (!picks.ok) {
        return picks;
      }
      draftsWithPicks.push({ draft, picks: picks.value });
    }

    return ok(normalizeDraftPicks({ draftsWithPicks, playerCatalog, ref }));
  }

  private async fetchFinalStandings(
    league: SleeperLeague,
    teams: readonly NormalizedTeam[],
  ): Promise<ProviderResult<NormalizedFinalStanding[]>> {
    const leagueId = toId(league.league_id);
    if (!leagueId) {
      return ok(finalStandingsFromTeams(teams));
    }

    const winnersBracket = await this.fetchBracket(
      leagueWinnersBracketUrl(leagueId),
      "league-winners-bracket",
    );
    if (!winnersBracket.ok) {
      return winnersBracket;
    }
    const losersBracket = await this.fetchBracket(
      leagueLosersBracketUrl(leagueId),
      "league-losers-bracket",
    );
    if (!losersBracket.ok) {
      return losersBracket;
    }
    const settings = isPlainObject(league.settings) ? league.settings : {};

    return ok(
      finalStandingsFromTeams(teams, {
        losersBracket: losersBracket.value,
        playoffTeamCount: positiveInteger(
          numberSetting(settings, "playoff_teams"),
        ),
        winnersBracket: winnersBracket.value,
      }),
    );
  }

  private async fetchAllNormalizedMatchupsAndRosters({
    league,
    playerCatalog,
    ref,
    rosterRows,
  }: {
    league: SleeperLeague;
    playerCatalog: ReadonlyMap<string, SleeperCatalogPlayer>;
    ref: ProviderLeagueRef;
    rosterRows: readonly SleeperRoster[];
  }): Promise<
    ProviderResult<{
      matchups: NormalizedMatchup[];
      rosters: NormalizedRoster[];
    }>
  > {
    const normalizedMatchups: NormalizedMatchup[] = [];
    const normalizedRosters: NormalizedRoster[] = [];
    for (let week = 1; week <= maxWeekForLeague(league); week += 1) {
      const matchups = await this.fetchMatchups(ref.providerId, week);
      if (!matchups.ok) {
        return matchups;
      }
      normalizedMatchups.push(
        ...normalizeMatchupsForWeek({
          league,
          matchups: matchups.value,
          ref,
          scoringPeriod: week,
        }),
      );
      const matchupByRosterId = new Map(
        matchups.value.map((matchup) => [
          String(toInteger(matchup.roster_id) ?? matchup.roster_id),
          matchup,
        ]),
      );
      normalizedRosters.push(
        ...rosterRows.map((roster) => {
          const providerId = rosterProviderId(roster);
          return normalizeRoster({
            league,
            matchup: matchupByRosterId.get(providerId),
            playerCatalog,
            ref,
            roster,
            scoringPeriod: week,
          });
        }),
      );
    }

    return ok({ matchups: normalizedMatchups, rosters: normalizedRosters });
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

  private async fetchDrafts(
    leagueId: string,
  ): Promise<ProviderResult<SleeperDraft[]>> {
    return this.fetchJson(
      leagueDraftsUrl(leagueId),
      sleeperDraftListSchema,
      "league-drafts",
    );
  }

  private async fetchDraftPicks(
    draftId: string,
  ): Promise<ProviderResult<SleeperDraftPick[]>> {
    return this.fetchJson(
      draftPicksUrl(draftId),
      sleeperDraftPickListSchema,
      "draft-picks",
    );
  }

  private async fetchBracket(
    url: string,
    resource: string,
  ): Promise<ProviderResult<SleeperBracketMatch[]>> {
    const bracket = await this.fetchJson(url, sleeperBracketSchema, resource);
    if (!bracket.ok && bracket.error instanceof ProviderNotFoundError) {
      return ok([]);
    }
    return bracket;
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

function providerForClient(client: SleeperClient): SleeperProvider {
  return {
    id: SLEEPER_PROVIDER_ID,
    name: "Sleeper Fantasy Football",
    capabilities: SLEEPER_PROVIDER_CAPABILITIES,
    authenticate: (credentials) => client.authenticate(credentials),
    discoverLeagues: (session) => client.discoverLeagues(session),
    getHistory: (session, ref, options) =>
      client.getHistory(session, ref, options),
    getDraftPicks: (session, ref) => client.getDraftPicks(session, ref),
    getLeague: (session, ref) => client.getLeague(session, ref),
    getMatchups: (session, ref, scoringPeriod) =>
      client.getMatchups(session, ref, scoringPeriod),
    getMembers: (session, ref) => client.getMembers(session, ref),
    getRosters: (session, ref, scoringPeriod) =>
      client.getRosters(session, ref, scoringPeriod),
    getTeams: (session, ref) => client.getTeams(session, ref),
    getTransactions: (session, ref, scoringPeriod) =>
      client.getTransactions(session, ref, scoringPeriod),
  };
}

export function createSleeperProvider(
  options?: SleeperClientOptions,
): SleeperProvider {
  const networkProvider = providerForClient(createSleeperClient(options));
  if (options !== undefined) {
    return networkProvider;
  }

  let fixtureProviderPromise: Promise<SleeperProvider> | undefined;
  let fixtureAllowedPromise: Promise<boolean> | undefined;
  const fixtureAllowed = (): Promise<boolean> => {
    fixtureAllowedPromise ??= import("@/core/env").then(
      ({ getEnv }) => getEnv().nodeEnv !== "production",
    );
    return fixtureAllowedPromise;
  };
  const fixtureProvider = (): Promise<SleeperProvider> => {
    fixtureProviderPromise ??= import("./fixture-sleeper").then(
      ({ createFixtureSleeperProvider }) => createFixtureSleeperProvider(),
    );
    return fixtureProviderPromise;
  };
  const providerForSession = async (
    session: SleeperSession,
  ): Promise<SleeperProvider> =>
    isFixtureSleeperSession(session) && (await fixtureAllowed())
      ? fixtureProvider()
      : networkProvider;

  return {
    id: networkProvider.id,
    name: networkProvider.name,
    capabilities: networkProvider.capabilities,
    authenticate: async (credentials) =>
      isFixtureSleeperCredential(credentials.usernameOrUserId) &&
      (await fixtureAllowed())
        ? (await fixtureProvider()).authenticate(credentials)
        : networkProvider.authenticate(credentials),
    discoverLeagues: async (session) =>
      (await providerForSession(session)).discoverLeagues(session),
    getHistory: async (session, ref, historyOptions) =>
      (await providerForSession(session)).getHistory(
        session,
        ref,
        historyOptions,
      ),
    getDraftPicks: async (session, ref) =>
      (await providerForSession(session)).getDraftPicks?.(session, ref) ??
      ok([]),
    getLeague: async (session, ref) =>
      (await providerForSession(session)).getLeague(session, ref),
    getMatchups: async (session, ref, scoringPeriod) =>
      (await providerForSession(session)).getMatchups(
        session,
        ref,
        scoringPeriod,
      ),
    getMembers: async (session, ref) =>
      (await providerForSession(session)).getMembers(session, ref),
    getRosters: async (session, ref, scoringPeriod) =>
      (await providerForSession(session)).getRosters(
        session,
        ref,
        scoringPeriod,
      ),
    getTeams: async (session, ref) =>
      (await providerForSession(session)).getTeams(session, ref),
    getTransactions: async (session, ref, scoringPeriod) =>
      (await providerForSession(session)).getTransactions(
        session,
        ref,
        scoringPeriod,
      ),
  };
}
