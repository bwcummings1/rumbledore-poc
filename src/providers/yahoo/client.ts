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
} from "../model";

export const yahooCredentialsSchema = z.object({
  accessToken: z.string().trim().min(1),
  discoveryGameKeys: z.array(z.string().trim().min(1)).max(20).optional(),
  discoverySeasons: z
    .array(z.number().int().min(2000).max(2100))
    .max(20)
    .optional(),
  expiresAt: z.iso.datetime().optional(),
  historicalLeagueKeysByLeagueKey: z
    .record(z.string().trim().min(1), z.array(z.string().trim().min(1)))
    .optional(),
  leagueKeys: z.array(z.string().trim().min(1)).max(50).optional(),
  refreshToken: z.string().trim().min(1).optional(),
  scope: z.string().trim().min(1).optional(),
  subjectProviderId: z.string().trim().min(1).optional(),
  tokenType: z.string().trim().min(1).default("Bearer"),
});

export type YahooCredentials = z.input<typeof yahooCredentialsSchema>;

export interface YahooSession extends FantasyProviderSession {
  provider: "yahoo";
  authKind: "oauth2";
  accessToken: string;
  discoveryGameKeys: string[];
  discoverySeasons: number[];
  historicalLeagueKeysByLeagueKey: Record<string, string[]>;
  leagueKeys: string[];
  refreshToken?: string;
  tokenType: string;
}

export type YahooFetch = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface YahooClientOptions {
  fetch?: YahooFetch;
  maxAttempts?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
}

export type YahooProvider = FantasyProvider<YahooCredentials, YahooSession>;

const YAHOO_PROVIDER_ID = "yahoo";
const YAHOO_API_ORIGIN = "https://fantasysports.yahooapis.com";
const YAHOO_USER_AGENT = "Rumbledore/2.0 (+https://rumbledore.app)";
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 250;
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_DISCOVERY_GAME_KEYS = ["nfl"];
const DEFAULT_HISTORY_GAME_KEYS = ["nfl"];
const DEFAULT_FANTASY_WEEKS = 17;

export const YAHOO_PROVIDER_CAPABILITIES: FantasyProviderCapabilities = {
  authKind: "oauth2",
  dataClasses: {
    league: "full",
    teams: "full",
    members: "full",
    rosters: "full",
    matchups: "full",
    final_standings: "partial",
    transactions: "partial",
    history: "partial",
    divisions: "none",
    keeper_dynasty: "none",
    scoring_detail: "partial",
  },
  requiresOAuth: true,
  supportsHistory: true,
  supportsRosters: true,
  supportsTransactions: true,
};

type JsonRecord = Record<string, unknown>;
type YahooLeagueResource = {
  currentWeek: number;
  draftStatus?: string;
  endWeek: number;
  isFinished: boolean;
  leagueId?: string;
  leagueKey: string;
  name: string;
  numTeams: number;
  scoringSettings: Record<string, unknown>;
  scoringType: string;
  season?: number;
  startWeek: number;
};
type YahooManagerResource = {
  guid?: string;
  isCommissioner: boolean;
  managerId?: string;
  nickname?: string;
};
type YahooTeamResource = {
  abbrev?: string;
  key: string;
  id: string;
  logo?: string;
  managers: YahooManagerResource[];
  name: string;
  pointsAgainst: number;
  pointsFor: number;
  rank?: number;
  ties: number;
  wins: number;
  losses: number;
};
type YahooMatchupResource = {
  isTied: boolean;
  status: string;
  teams: YahooTeamResource[];
  week: number;
  winnerTeamKey?: string;
};
type YahooRosterPlayerResource = {
  key: string;
  id: string;
  name: string;
  points?: number;
  position: string;
  selectedPosition?: string;
  status?: string;
  team?: string;
};
type YahooTransactionResource = {
  key: string;
  players: ProviderEntityRef[];
  timestamp: Date;
  type: NormalizedTransactionType;
};
type YahooUserTeam = {
  gameKey?: string;
  leagueKey: string;
  leagueName?: string;
  leagueSize?: number;
  season: number;
  teamName?: string;
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asYahooObject(value: unknown): JsonRecord {
  if (Array.isArray(value)) {
    const merged: JsonRecord = {};
    for (const item of value) {
      if (!isRecord(item)) {
        continue;
      }
      for (const [key, nested] of Object.entries(item)) {
        merged[key] = nested;
      }
    }
    return merged;
  }

  return isRecord(value) ? value : {};
}

function numericValues(value: unknown): unknown[] {
  if (!isRecord(value)) {
    return [];
  }

  return Object.keys(value)
    .filter((key) => /^\d+$/.test(key))
    .sort((left, right) => Number(left) - Number(right))
    .map((key) => value[key]);
}

function field(value: unknown, key: string): unknown {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = field(item, key);
      if (found !== undefined) {
        return found;
      }
    }
    return undefined;
  }

  if (!isRecord(value)) {
    return undefined;
  }

  if (Object.hasOwn(value, key)) {
    return value[key];
  }

  for (const nested of numericValues(value)) {
    const found = field(nested, key);
    if (found !== undefined) {
      return found;
    }
  }

  return undefined;
}

function pathField(value: unknown, keys: readonly string[]): unknown {
  let current = value;
  for (const key of keys) {
    current = field(current, key);
    if (current === undefined) {
      return undefined;
    }
  }
  return current;
}

function collectionItems(container: unknown, resourceKey: string): unknown[] {
  const values = numericValues(container);
  if (values.length > 0) {
    return values
      .map((value) => field(value, resourceKey) ?? value)
      .filter((value) => value !== undefined);
  }

  const direct = field(container, resourceKey);
  if (direct !== undefined) {
    return [direct];
  }

  if (Array.isArray(container)) {
    return container;
  }

  return [];
}

function fantasyContent(json: unknown): unknown {
  return field(json, "fantasy_content") ?? json;
}

function toStringValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

function toInteger(value: unknown): number | undefined {
  if (typeof value === "number") {
    return Number.isInteger(value) ? value : undefined;
  }
  const text = toStringValue(value);
  if (!text) {
    return undefined;
  }
  const parsed = Number(text);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  const text = toStringValue(value);
  if (!text) {
    return undefined;
  }
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toBoolean(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  const text = toStringValue(value)?.toLowerCase();
  return text === "1" || text === "true" || text === "yes";
}

function compactUnique(values: readonly (string | undefined)[]): string[] {
  return [
    ...new Set(values.filter((value): value is string => Boolean(value))),
  ];
}

function leagueKeyFromTeamKey(teamKey: string | undefined): string | undefined {
  const match = teamKey?.match(/^(.+\.l\.[^.]+)\.t\.[^.]+$/);
  return match?.[1];
}

function teamIdFromTeamKey(teamKey: string | undefined): string | undefined {
  return teamKey?.split(".t.")[1]?.trim() || undefined;
}

function gameKeyFromLeagueKey(leagueKey: string): string | undefined {
  return leagueKey.split(".l.")[0]?.trim() || undefined;
}

function leagueIdFromLeagueKey(leagueKey: string): string | undefined {
  return leagueKey.split(".l.")[1]?.trim() || undefined;
}

function leagueUrl(leagueKey: string): string {
  return yahooApiUrl(
    `/fantasy/v2/league/${encodeURIComponent(leagueKey)};out=settings,standings`,
  );
}

function scoreboardUrl(leagueKey: string, week: number): string {
  return yahooApiUrl(
    `/fantasy/v2/league/${encodeURIComponent(leagueKey)}/scoreboard;week=${week}`,
  );
}

function teamRosterUrl(teamKey: string, week: number): string {
  return yahooApiUrl(
    `/fantasy/v2/team/${encodeURIComponent(teamKey)}/roster;week=${week}`,
  );
}

function transactionsUrl(leagueKey: string): string {
  return yahooApiUrl(
    `/fantasy/v2/league/${encodeURIComponent(leagueKey)}/transactions`,
  );
}

function userTeamsUrl(gameKey: string): string {
  return yahooApiUrl(
    `/fantasy/v2/users;use_login=1/games;game_keys=${encodeURIComponent(
      gameKey,
    )}/teams`,
  );
}

function yahooApiUrl(path: string): string {
  const url = new URL(path, YAHOO_API_ORIGIN);
  url.searchParams.set("format", "json");
  return url.toString();
}

function yahooHeaders(
  session: Pick<YahooSession, "accessToken" | "tokenType">,
) {
  return {
    Accept: "application/json",
    Authorization: `${session.tokenType} ${session.accessToken}`,
    "User-Agent": YAHOO_USER_AGENT,
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
    return new AuthExpiredError(YAHOO_PROVIDER_ID);
  }
  if (response.status === 404) {
    return new ProviderNotFoundError(YAHOO_PROVIDER_ID, { resource });
  }
  if (response.status === 429) {
    return new RateLimitedError(YAHOO_PROVIDER_ID, retryAfterSeconds(response));
  }
  if (response.status >= 500) {
    return new ProviderBlockedError(YAHOO_PROVIDER_ID);
  }
  return new ProviderParseError(
    YAHOO_PROVIDER_ID,
    `Yahoo ${resource} API returned HTTP ${response.status}`,
  );
}

function defaultDiscoveryGameKeys(credentials: YahooCredentials): string[] {
  return compactUnique([
    ...DEFAULT_DISCOVERY_GAME_KEYS,
    ...(credentials.discoveryGameKeys ?? []),
    ...(credentials.leagueKeys ?? []).map(gameKeyFromLeagueKey),
  ]);
}

function normalizeDiscoverySeasons(
  seasons: readonly number[] | undefined,
): number[] {
  return [...new Set(seasons ?? [])]
    .filter((season) => Number.isInteger(season) && season > 0)
    .sort((left, right) => right - left);
}

function tokenExpired(expiresAt: string | undefined, now: () => Date): boolean {
  if (!expiresAt) {
    return false;
  }
  const expires = new Date(expiresAt).getTime();
  return Number.isFinite(expires) && expires <= now().getTime();
}

function normalizeSportFromGame(game: JsonRecord): "ffl" | "unknown" {
  const code = toStringValue(field(game, "code"))?.toLowerCase();
  const gameKey = toStringValue(field(game, "game_key"))?.toLowerCase();
  return code === "nfl" || gameKey === "nfl" || /^\d+$/.test(gameKey ?? "")
    ? "ffl"
    : "unknown";
}

function normalizeLeagueStatus(league: YahooLeagueResource) {
  if (league.isFinished) {
    return "complete" satisfies NormalizedLeague["status"];
  }
  switch (league.draftStatus?.toLowerCase()) {
    case "predraft":
    case "pre_draft":
      return "preseason" satisfies NormalizedLeague["status"];
    default:
      return league.currentWeek > 0
        ? ("in_season" satisfies NormalizedLeague["status"])
        : ("unknown" satisfies NormalizedLeague["status"]);
  }
}

function normalizeScoringType(value: string | undefined): string {
  switch (value?.toLowerCase()) {
    case "head":
    case "h2h":
      return "H2H";
    case "point":
    case "points":
      return "SEASON_POINTS";
    case "roto":
      return "ROTO";
    default:
      return value?.trim().toUpperCase() || "unknown";
  }
}

function parseLeagueResource(value: unknown, fallback: ProviderLeagueRef) {
  const leagueValue = field(fantasyContent(value), "league") ?? value;
  const league = asYahooObject(leagueValue);
  const leagueKey =
    toStringValue(field(league, "league_key")) || fallback.providerId;
  const numTeams = toInteger(field(league, "num_teams")) ?? fallback.size ?? 0;
  const currentWeek = toInteger(field(league, "current_week")) ?? 0;
  const startWeek = toInteger(field(league, "start_week")) ?? 1;
  const endWeek = toInteger(field(league, "end_week")) ?? DEFAULT_FANTASY_WEEKS;

  return {
    currentWeek,
    draftStatus: toStringValue(field(league, "draft_status")),
    endWeek,
    isFinished: toBoolean(field(league, "is_finished")),
    leagueId: toStringValue(field(league, "league_id")),
    leagueKey,
    name:
      toStringValue(field(league, "name")) ||
      fallback.name ||
      `Yahoo League ${leagueKey}`,
    numTeams,
    scoringSettings: {
      endWeek,
      rawScoringType: toStringValue(field(league, "scoring_type")) || "unknown",
      startWeek,
    },
    scoringType: toStringValue(field(league, "scoring_type")) || "unknown",
    season: toInteger(field(league, "season")) ?? fallback.season,
    startWeek,
  } satisfies YahooLeagueResource;
}

function normalizeLeague(resource: YahooLeagueResource): NormalizedLeague {
  return {
    provider: YAHOO_PROVIDER_ID,
    providerId: resource.leagueKey,
    season: resource.season ?? 0,
    sport: "ffl",
    name: resource.name,
    scoringType: normalizeScoringType(resource.scoringType),
    scoringSettings: resource.scoringSettings,
    size: resource.numTeams,
    currentScoringPeriod: resource.currentWeek,
    status: normalizeLeagueStatus(resource),
  };
}

function managerResource(value: unknown): YahooManagerResource {
  const manager = asYahooObject(value);
  return {
    guid: toStringValue(field(manager, "guid")),
    isCommissioner: toBoolean(field(manager, "is_commissioner")),
    managerId: toStringValue(field(manager, "manager_id")),
    nickname: toStringValue(field(manager, "nickname")),
  };
}

function managerId(manager: YahooManagerResource): string | undefined {
  return (
    manager.guid ??
    (manager.managerId ? `manager:${manager.managerId}` : undefined)
  );
}

function teamLogo(value: JsonRecord): string | undefined {
  const logoValue = field(field(value, "team_logos"), "team_logo");
  if (logoValue !== undefined) {
    const logo = asYahooObject(logoValue);
    return toStringValue(field(logo, "url"));
  }

  for (const item of collectionItems(field(value, "team_logos"), "team_logo")) {
    const logo = asYahooObject(item);
    const url = toStringValue(field(logo, "url"));
    if (url) {
      return url;
    }
  }

  return undefined;
}

function parseTeamResource(value: unknown): YahooTeamResource {
  const team = asYahooObject(value);
  const teamKey = toStringValue(field(team, "team_key")) ?? "unknown";
  const id =
    toStringValue(field(team, "team_id")) ??
    teamIdFromTeamKey(teamKey) ??
    teamKey;
  const standings = field(team, "team_standings");
  const totals = field(standings, "outcome_totals");
  const teamPoints = field(team, "team_points");
  const managers = collectionItems(field(team, "managers"), "manager").map(
    managerResource,
  );

  return {
    abbrev: toStringValue(field(team, "team_abbr")),
    key: teamKey,
    id,
    logo: teamLogo(team),
    managers,
    name: toStringValue(field(team, "name")) ?? `Yahoo Team ${id}`,
    pointsAgainst: toNumber(field(team, "points_against")) ?? 0,
    pointsFor: toNumber(field(teamPoints, "total")) ?? 0,
    rank: toInteger(field(standings, "rank")),
    ties: toInteger(field(totals, "ties")) ?? 0,
    wins: toInteger(field(totals, "wins")) ?? 0,
    losses: toInteger(field(totals, "losses")) ?? 0,
  };
}

function teamsFromLeaguePayload(json: unknown): YahooTeamResource[] {
  const content = fantasyContent(json);
  const league = field(content, "league") ?? content;
  const standingsTeams = collectionItems(
    pathField(league, ["standings", "teams"]) ?? field(league, "teams"),
    "team",
  );

  return standingsTeams
    .map(parseTeamResource)
    .filter((team) => team.key !== "unknown")
    .sort((left, right) => {
      const leftRank = left.rank ?? Number.MAX_SAFE_INTEGER;
      const rightRank = right.rank ?? Number.MAX_SAFE_INTEGER;
      return leftRank - rightRank || left.id.localeCompare(right.id);
    });
}

function normalizeTeam(
  team: YahooTeamResource,
  ref: ProviderLeagueRef,
): NormalizedTeam {
  const ownerMemberIds = compactUnique(team.managers.map(managerId));
  return {
    provider: YAHOO_PROVIDER_ID,
    providerId: team.id,
    leagueProviderId: ref.providerId,
    season: ref.season,
    name: team.name,
    abbrev: team.abbrev ?? team.name.slice(0, 3).toUpperCase() ?? team.id,
    ...(team.logo ? { logo: team.logo } : {}),
    ownerMemberIds,
    record: {
      wins: team.wins,
      losses: team.losses,
      ties: team.ties,
      pointsFor: team.pointsFor,
      pointsAgainst: team.pointsAgainst,
    },
  };
}

function normalizeMember(
  manager: YahooManagerResource,
  ref: ProviderLeagueRef,
): NormalizedMember | undefined {
  const providerId = managerId(manager);
  if (!providerId) {
    return undefined;
  }
  return {
    provider: YAHOO_PROVIDER_ID,
    providerId,
    leagueProviderId: ref.providerId,
    season: ref.season,
    displayName: manager.nickname ?? `Yahoo Manager ${providerId}`,
    role: manager.isCommissioner ? "commissioner" : "member",
  };
}

function finalStandingsFromTeams(
  teams: readonly YahooTeamResource[],
  ref: ProviderLeagueRef,
): NormalizedFinalStanding[] {
  return teams
    .filter((team) => team.rank !== undefined)
    .map((team) => {
      const standing: NormalizedFinalStanding = {
        leagueProviderId: ref.providerId,
        teamRef: {
          provider: YAHOO_PROVIDER_ID,
          providerId: team.id,
          season: ref.season,
        },
        rank: team.rank ?? 0,
        wins: team.wins,
        losses: team.losses,
        ties: team.ties,
        pointsFor: team.pointsFor,
        pointsAgainst: team.pointsAgainst,
      };
      return standing;
    })
    .sort((left, right) => left.rank - right.rank);
}

function parseMatchupResource(value: unknown): YahooMatchupResource {
  const matchup = asYahooObject(value);
  return {
    isTied: toBoolean(field(matchup, "is_tied")),
    status: toStringValue(field(matchup, "status")) ?? "unknown",
    teams: collectionItems(field(matchup, "teams"), "team").map(
      parseTeamResource,
    ),
    week: toInteger(field(matchup, "week")) ?? 0,
    winnerTeamKey: toStringValue(field(matchup, "winner_team_key")),
  };
}

function matchupStatus(status: string): NormalizedMatchupStatus {
  switch (status.toLowerCase()) {
    case "postevent":
      return "final";
    case "midevent":
      return "in_progress";
    case "preevent":
      return "scheduled";
    default:
      return "unknown";
  }
}

function matchupWinner({
  away,
  home,
  matchup,
  status,
}: {
  away: YahooTeamResource;
  home: YahooTeamResource;
  matchup: YahooMatchupResource;
  status: NormalizedMatchupStatus;
}): NormalizedMatchupWinner {
  if (status !== "final") {
    return "unknown";
  }
  if (matchup.isTied) {
    return "tie";
  }
  if (matchup.winnerTeamKey === home.key) {
    return "home";
  }
  if (matchup.winnerTeamKey === away.key) {
    return "away";
  }
  if (home.pointsFor > away.pointsFor) {
    return "home";
  }
  if (away.pointsFor > home.pointsFor) {
    return "away";
  }
  return "tie";
}

function normalizeMatchup(
  matchup: YahooMatchupResource,
  ref: ProviderLeagueRef,
): NormalizedMatchup | undefined {
  const [home, away] = matchup.teams;
  if (!home || !away || matchup.week <= 0) {
    return undefined;
  }

  const status = matchupStatus(matchup.status);
  return {
    provider: YAHOO_PROVIDER_ID,
    providerId: `${matchup.week}:${home.id}:${away.id}`,
    leagueProviderId: ref.providerId,
    season: ref.season,
    scoringPeriod: matchup.week,
    homeTeamRef: {
      provider: YAHOO_PROVIDER_ID,
      providerId: home.id,
      season: ref.season,
    },
    awayTeamRef: {
      provider: YAHOO_PROVIDER_ID,
      providerId: away.id,
      season: ref.season,
    },
    homeScore: home.pointsFor,
    awayScore: away.pointsFor,
    winner: matchupWinner({ away, home, matchup, status }),
    status,
  };
}

function matchupsFromScoreboardPayload(
  json: unknown,
  ref: ProviderLeagueRef,
): NormalizedMatchup[] {
  const content = fantasyContent(json);
  const league = field(content, "league") ?? content;
  const matchups = collectionItems(
    pathField(league, ["scoreboard", "matchups"]),
    "matchup",
  );

  return matchups
    .map((matchup) => normalizeMatchup(parseMatchupResource(matchup), ref))
    .filter((matchup): matchup is NormalizedMatchup => Boolean(matchup))
    .sort((left, right) => left.providerId.localeCompare(right.providerId));
}

function rosterPlayer(value: unknown): YahooRosterPlayerResource | undefined {
  const player = asYahooObject(value);
  const key = toStringValue(field(player, "player_key"));
  const id = toStringValue(field(player, "player_id")) ?? key?.split(".p.")[1];
  if (!key || !id) {
    return undefined;
  }

  const name = asYahooObject(field(player, "name"));
  const selectedPosition = asYahooObject(field(player, "selected_position"));
  const points = asYahooObject(field(player, "player_points"));

  return {
    key,
    id,
    name: toStringValue(field(name, "full")) ?? `Yahoo Player ${id}`,
    points: toNumber(field(points, "total")),
    position: toStringValue(field(player, "display_position")) ?? "unknown",
    selectedPosition: toStringValue(field(selectedPosition, "position")),
    status: toStringValue(field(player, "status")),
    team: toStringValue(field(player, "editorial_team_abbr")),
  };
}

function normalizeRosterStatus(slot: string | undefined): string {
  switch (slot?.toUpperCase()) {
    case "BN":
      return "bench";
    case "IR":
    case "IR+":
      return "reserve";
    default:
      return slot ? "active" : "unknown";
  }
}

function normalizeRosterEntry(
  player: YahooRosterPlayerResource,
): NormalizedRosterEntry {
  const slot = player.selectedPosition ?? player.position;
  return {
    playerRef: { provider: YAHOO_PROVIDER_ID, providerId: player.id },
    slot,
    status: player.status ?? normalizeRosterStatus(slot),
    ...(player.points === undefined ? {} : { points: player.points }),
  };
}

function rosterFromPayload({
  json,
  ref,
  scoringPeriod,
  team,
}: {
  json: unknown;
  ref: ProviderLeagueRef;
  scoringPeriod: number;
  team: YahooTeamResource;
}): NormalizedRoster {
  const players = collectionItems(
    pathField(fantasyContent(json), ["team", "roster", "players"]),
    "player",
  )
    .map(rosterPlayer)
    .filter((player): player is YahooRosterPlayerResource => Boolean(player));

  return {
    teamRef: {
      provider: YAHOO_PROVIDER_ID,
      providerId: team.id,
      season: ref.season,
    },
    season: ref.season,
    scoringPeriod,
    entries: players.map(normalizeRosterEntry),
  };
}

function parseTransactionResource(value: unknown): YahooTransactionResource {
  const transaction = asYahooObject(value);
  const rawType = toStringValue(field(transaction, "type"))?.toLowerCase();
  const type: NormalizedTransactionType = rawType?.includes("trade")
    ? "trade"
    : rawType?.includes("waiver")
      ? "waiver"
      : rawType?.includes("drop") && !rawType.includes("add")
        ? "drop"
        : rawType?.includes("add")
          ? "add"
          : "unknown";
  const timestamp =
    toNumber(field(transaction, "timestamp")) ??
    toNumber(field(transaction, "transaction_timestamp")) ??
    0;
  const players: ProviderEntityRef[] = [];
  for (const playerValue of collectionItems(
    field(transaction, "players"),
    "player",
  )) {
    const player = asYahooObject(playerValue);
    const key = toStringValue(field(player, "player_key"));
    const id =
      toStringValue(field(player, "player_id")) ?? key?.split(".p.")[1];
    if (id) {
      players.push({ provider: YAHOO_PROVIDER_ID, providerId: id });
    }
  }

  return {
    key:
      toStringValue(field(transaction, "transaction_key")) ??
      toStringValue(field(transaction, "transaction_id")) ??
      "unknown",
    players,
    timestamp: new Date(timestamp * 1000),
    type,
  };
}

function normalizeTransaction(
  transaction: YahooTransactionResource,
  ref: ProviderLeagueRef,
): NormalizedTransaction {
  return {
    provider: YAHOO_PROVIDER_ID,
    providerId: transaction.key,
    leagueProviderId: ref.providerId,
    season: ref.season,
    type: transaction.type,
    teamRefs: [],
    playerRefs: transaction.players,
    timestamp: transaction.timestamp,
    details: {},
  };
}

function transactionsFromPayload(
  json: unknown,
  ref: ProviderLeagueRef,
): NormalizedTransaction[] {
  const transactions = collectionItems(
    pathField(fantasyContent(json), ["league", "transactions"]),
    "transaction",
  );

  return transactions
    .map(parseTransactionResource)
    .map((transaction) => normalizeTransaction(transaction, ref))
    .sort((left, right) => left.providerId.localeCompare(right.providerId));
}

function userTeamsFromPayload(json: unknown): {
  subjectProviderId?: string;
  teams: YahooUserTeam[];
} {
  const content = fantasyContent(json);
  const users = collectionItems(field(content, "users"), "user");
  const teams: YahooUserTeam[] = [];
  let subjectProviderId: string | undefined;

  for (const userValue of users) {
    const user = asYahooObject(userValue);
    subjectProviderId ||= toStringValue(field(user, "guid"));
    for (const gameValue of collectionItems(field(user, "games"), "game")) {
      const game = asYahooObject(gameValue);
      const sport = normalizeSportFromGame(game);
      if (sport !== "ffl") {
        continue;
      }

      const gameKey = toStringValue(field(game, "game_key"));
      const season = toInteger(field(game, "season")) ?? 0;
      for (const teamValue of collectionItems(field(game, "teams"), "team")) {
        const team = asYahooObject(teamValue);
        const teamKey = toStringValue(field(team, "team_key"));
        const leagueKey =
          toStringValue(field(team, "league_key")) ??
          leagueKeyFromTeamKey(teamKey);
        if (!leagueKey) {
          continue;
        }
        teams.push({
          gameKey,
          leagueKey,
          leagueName: toStringValue(field(team, "league_name")),
          leagueSize: toInteger(field(team, "num_teams")),
          season,
          teamName: toStringValue(field(team, "name")),
        });
      }
    }
  }

  return { subjectProviderId, teams };
}

function refsFromUserTeams(
  userTeams: readonly YahooUserTeam[],
): ProviderLeagueRef[] {
  const refs = new Map<string, ProviderLeagueRef>();
  for (const team of userTeams) {
    if (!team.season) {
      continue;
    }
    refs.set(`${team.season}:${team.leagueKey}`, {
      provider: YAHOO_PROVIDER_ID,
      providerId: team.leagueKey,
      season: team.season,
      sport: "ffl",
      name: team.leagueName ?? `Yahoo League ${team.leagueKey}`,
      ...(team.teamName ? { teamName: team.teamName } : {}),
      ...(team.leagueSize === undefined ? {} : { size: team.leagueSize }),
    });
  }

  return [...refs.values()].sort(
    (left, right) =>
      right.season - left.season || left.name.localeCompare(right.name),
  );
}

function weeksForLeague(league: YahooLeagueResource): number[] {
  const status = normalizeLeagueStatus(league);
  let lastWeek: number;
  switch (status) {
    case "complete":
      lastWeek = league.endWeek;
      break;
    default:
      lastWeek = Math.max(league.startWeek, league.currentWeek);
      break;
  }
  const start = Math.max(1, league.startWeek || 1);
  const end = Math.max(start, lastWeek || DEFAULT_FANTASY_WEEKS);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

export class YahooClient {
  private readonly fetchImpl: YahooFetch;
  private readonly maxAttempts: number;
  private readonly retryDelayMs: number;
  private readonly timeoutMs: number;
  private readonly now: () => Date;

  constructor(options: YahooClientOptions & { now?: () => Date } = {}) {
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.maxAttempts = Math.max(1, options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
    this.retryDelayMs = Math.max(
      0,
      options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS,
    );
    this.timeoutMs = Math.max(1, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    this.now = options.now ?? (() => new Date());
  }

  async authenticate(
    credentials: YahooCredentials,
  ): Promise<ProviderResult<YahooSession>> {
    const parsed = yahooCredentialsSchema.safeParse(credentials);
    if (!parsed.success || tokenExpired(parsed.data.expiresAt, this.now)) {
      return err(new AuthExpiredError(YAHOO_PROVIDER_ID));
    }

    const sessionBase = {
      accessToken: parsed.data.accessToken,
      tokenType: parsed.data.tokenType,
    };
    const firstGameKey =
      defaultDiscoveryGameKeys(parsed.data)[0] ??
      DEFAULT_DISCOVERY_GAME_KEYS[0];
    const userTeams = await this.fetchUserTeams(sessionBase, firstGameKey);
    if (!userTeams.ok) {
      return userTeams;
    }

    const subjectProviderId =
      parsed.data.subjectProviderId ?? userTeams.value.subjectProviderId;
    if (!subjectProviderId) {
      return err(
        new ProviderParseError(
          YAHOO_PROVIDER_ID,
          "Yahoo user teams response did not include a durable user guid",
        ),
      );
    }

    return ok({
      provider: YAHOO_PROVIDER_ID,
      authKind: "oauth2",
      subjectProviderId,
      accessToken: parsed.data.accessToken,
      discoveryGameKeys: defaultDiscoveryGameKeys(parsed.data),
      discoverySeasons: normalizeDiscoverySeasons(parsed.data.discoverySeasons),
      historicalLeagueKeysByLeagueKey:
        parsed.data.historicalLeagueKeysByLeagueKey ?? {},
      leagueKeys: compactUnique(parsed.data.leagueKeys ?? []),
      ...(parsed.data.refreshToken
        ? { refreshToken: parsed.data.refreshToken }
        : {}),
      tokenType: parsed.data.tokenType,
    });
  }

  async discoverLeagues(
    session: YahooSession,
  ): Promise<ProviderResult<ProviderLeagueRef[]>> {
    const refs = new Map<string, ProviderLeagueRef>();

    for (const gameKey of session.discoveryGameKeys) {
      const userTeams = await this.fetchUserTeams(session, gameKey);
      if (!userTeams.ok) {
        return userTeams;
      }

      for (const ref of refsFromUserTeams(userTeams.value.teams)) {
        if (
          session.discoverySeasons.length > 0 &&
          !session.discoverySeasons.includes(ref.season)
        ) {
          continue;
        }
        refs.set(`${ref.season}:${ref.providerId}`, ref);
      }
    }

    for (const leagueKey of session.leagueKeys) {
      const ref = await this.refFromLeagueKey(session, leagueKey);
      if (!ref.ok) {
        return ref;
      }
      const key = `${ref.value.season}:${ref.value.providerId}`;
      refs.set(key, {
        ...ref.value,
        ...refs.get(key),
      });
    }

    return ok(
      [...refs.values()].sort(
        (left, right) =>
          right.season - left.season || left.name.localeCompare(right.name),
      ),
    );
  }

  async getLeague(
    session: YahooSession,
    ref: ProviderLeagueRef,
  ): Promise<ProviderResult<NormalizedLeague>> {
    const league = await this.fetchLeague(session, ref);
    if (!league.ok) {
      return league;
    }

    return ok(normalizeLeague(league.value));
  }

  async getTeams(
    session: YahooSession,
    ref: ProviderLeagueRef,
  ): Promise<ProviderResult<NormalizedTeam[]>> {
    const teams = await this.fetchTeams(session, ref);
    if (!teams.ok) {
      return teams;
    }

    return ok(teams.value.map((team) => normalizeTeam(team, ref)));
  }

  async getMembers(
    session: YahooSession,
    ref: ProviderLeagueRef,
  ): Promise<ProviderResult<NormalizedMember[]>> {
    const teams = await this.fetchTeams(session, ref);
    if (!teams.ok) {
      return teams;
    }

    const members = new Map<string, NormalizedMember>();
    for (const team of teams.value) {
      for (const manager of team.managers) {
        const member = normalizeMember(manager, ref);
        if (member) {
          members.set(member.providerId, member);
        }
      }
    }

    return ok(
      [...members.values()].sort((left, right) =>
        left.providerId.localeCompare(right.providerId),
      ),
    );
  }

  async getRosters(
    session: YahooSession,
    ref: ProviderLeagueRef,
    scoringPeriod?: number,
  ): Promise<ProviderResult<NormalizedRoster[]>> {
    const [league, teams] = await Promise.all([
      this.fetchLeague(session, ref),
      this.fetchTeams(session, ref),
    ]);
    if (!league.ok) {
      return league;
    }
    if (!teams.ok) {
      return teams;
    }

    const period = scoringPeriod ?? league.value.currentWeek;
    const rosters: NormalizedRoster[] = [];
    for (const team of teams.value) {
      const roster = await this.fetchRoster(session, ref, team, period);
      if (!roster.ok) {
        return roster;
      }
      rosters.push(roster.value);
    }

    return ok(rosters);
  }

  async getMatchups(
    session: YahooSession,
    ref: ProviderLeagueRef,
    scoringPeriod?: number,
  ): Promise<ProviderResult<NormalizedMatchup[]>> {
    const league = await this.fetchLeague(session, ref);
    if (!league.ok) {
      return league;
    }

    const weeks =
      typeof scoringPeriod === "number"
        ? [scoringPeriod]
        : weeksForLeague(league.value);
    const matchups: NormalizedMatchup[] = [];
    for (const week of weeks) {
      const weekMatchups = await this.fetchMatchups(session, ref, week);
      if (!weekMatchups.ok) {
        return weekMatchups;
      }
      matchups.push(...weekMatchups.value);
    }

    return ok(
      matchups.sort((left, right) =>
        left.providerId.localeCompare(right.providerId),
      ),
    );
  }

  async getHistory(
    session: YahooSession,
    ref: ProviderLeagueRef,
    options: { seasons: number[] },
  ): Promise<ProviderResult<NormalizedSeasonBundle[]>> {
    const requested = [...new Set(options.seasons)]
      .filter((season) => Number.isInteger(season) && season > 0)
      .sort((left, right) => right - left);
    if (requested.length === 0) {
      return ok([]);
    }

    const refs = await this.historyRefs(session, ref, requested);
    if (!refs.ok) {
      return refs;
    }

    const bundles: NormalizedSeasonBundle[] = [];
    for (const historyRef of refs.value) {
      const bundle = await this.buildSeasonBundle(session, historyRef);
      if (!bundle.ok) {
        return bundle;
      }
      bundles.push(bundle.value);
    }

    return ok(
      bundles.sort((left, right) => right.league.season - left.league.season),
    );
  }

  private async historyRefs(
    session: YahooSession,
    ref: ProviderLeagueRef,
    requestedSeasons: readonly number[],
  ): Promise<ProviderResult<ProviderLeagueRef[]>> {
    const requested = new Set(requestedSeasons);
    const candidateKeys = compactUnique([
      ...session.discoveryGameKeys,
      ...DEFAULT_HISTORY_GAME_KEYS,
    ]);
    const discovered = await this.discoverLeagues({
      ...session,
      discoveryGameKeys: candidateKeys,
      discoverySeasons: [...requested],
    });
    if (!discovered.ok) {
      return discovered;
    }

    const currentLeagueId = leagueIdFromLeagueKey(ref.providerId);
    const explicitKeys = new Set(
      session.historicalLeagueKeysByLeagueKey[ref.providerId] ?? [],
    );
    const refs = discovered.value.filter((candidate) => {
      if (!requested.has(candidate.season)) {
        return false;
      }
      return (
        explicitKeys.has(candidate.providerId) ||
        leagueIdFromLeagueKey(candidate.providerId) === currentLeagueId
      );
    });

    return ok(refs);
  }

  private async buildSeasonBundle(
    session: YahooSession,
    ref: ProviderLeagueRef,
  ): Promise<ProviderResult<NormalizedSeasonBundle>> {
    const [league, teams, members, matchups, transactions] = await Promise.all([
      this.getLeague(session, ref),
      this.fetchTeams(session, ref),
      this.getMembers(session, ref),
      this.getMatchups(session, ref),
      this.fetchTransactions(session, ref),
    ]);
    if (!league.ok) {
      return league;
    }
    if (!teams.ok) {
      return teams;
    }
    if (!members.ok) {
      return members;
    }
    if (!matchups.ok) {
      return matchups;
    }
    if (!transactions.ok) {
      return transactions;
    }

    return ok({
      league: league.value,
      teams: teams.value.map((team) => normalizeTeam(team, ref)),
      members: members.value,
      matchups: matchups.value,
      finalStandings: finalStandingsFromTeams(teams.value, ref),
      transactions: transactions.value,
    });
  }

  private async refFromLeagueKey(
    session: YahooSession,
    leagueKey: string,
  ): Promise<ProviderResult<ProviderLeagueRef>> {
    const fallback = {
      provider: YAHOO_PROVIDER_ID,
      providerId: leagueKey,
      season: 0,
      sport: "ffl",
      name: `Yahoo League ${leagueKey}`,
    } satisfies ProviderLeagueRef;
    const league = await this.fetchLeague(session, fallback);
    if (!league.ok) {
      return league;
    }
    return ok({
      provider: YAHOO_PROVIDER_ID,
      providerId: league.value.leagueKey,
      season: league.value.season ?? 0,
      sport: "ffl",
      name: league.value.name,
      size: league.value.numTeams,
    });
  }

  private async fetchUserTeams(
    session: Pick<YahooSession, "accessToken" | "tokenType">,
    gameKey: string,
  ): Promise<
    ProviderResult<{ subjectProviderId?: string; teams: YahooUserTeam[] }>
  > {
    const json = await this.fetchJson(
      session,
      userTeamsUrl(gameKey),
      "user-teams",
    );
    if (!json.ok) {
      return json;
    }
    return ok(userTeamsFromPayload(json.value));
  }

  private async fetchLeague(
    session: YahooSession,
    ref: ProviderLeagueRef,
  ): Promise<ProviderResult<YahooLeagueResource>> {
    const json = await this.fetchJson(
      session,
      leagueUrl(ref.providerId),
      "league",
    );
    if (!json.ok) {
      return json;
    }
    return ok(parseLeagueResource(json.value, ref));
  }

  private async fetchTeams(
    session: YahooSession,
    ref: ProviderLeagueRef,
  ): Promise<ProviderResult<YahooTeamResource[]>> {
    const json = await this.fetchJson(
      session,
      leagueUrl(ref.providerId),
      "teams",
    );
    if (!json.ok) {
      return json;
    }
    return ok(teamsFromLeaguePayload(json.value));
  }

  private async fetchMatchups(
    session: YahooSession,
    ref: ProviderLeagueRef,
    week: number,
  ): Promise<ProviderResult<NormalizedMatchup[]>> {
    const json = await this.fetchJson(
      session,
      scoreboardUrl(ref.providerId, week),
      "scoreboard",
    );
    if (!json.ok) {
      return json;
    }
    return ok(matchupsFromScoreboardPayload(json.value, ref));
  }

  private async fetchRoster(
    session: YahooSession,
    ref: ProviderLeagueRef,
    team: YahooTeamResource,
    week: number,
  ): Promise<ProviderResult<NormalizedRoster>> {
    const json = await this.fetchJson(
      session,
      teamRosterUrl(team.key, week),
      "roster",
    );
    if (!json.ok) {
      return json;
    }
    return ok(
      rosterFromPayload({ json: json.value, ref, scoringPeriod: week, team }),
    );
  }

  private async fetchTransactions(
    session: YahooSession,
    ref: ProviderLeagueRef,
  ): Promise<ProviderResult<NormalizedTransaction[]>> {
    const json = await this.fetchJson(
      session,
      transactionsUrl(ref.providerId),
      "transactions",
    );
    if (!json.ok) {
      return json;
    }
    return ok(transactionsFromPayload(json.value, ref));
  }

  private async fetchJson(
    session: Pick<YahooSession, "accessToken" | "tokenType">,
    url: string,
    resource: string,
  ): Promise<ProviderResult<unknown>> {
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        const response = await this.fetchImpl(url, {
          cache: "no-store",
          headers: yahooHeaders(session),
          method: "GET",
          signal: AbortSignal.timeout(this.timeoutMs),
        });

        if (response.ok) {
          return await parseJson(response, resource);
        }

        const providerError = errorForStatus(response, resource);
        if (!shouldRetry(response.status) || attempt >= this.maxAttempts) {
          return err(providerError);
        }
      } catch (cause) {
        if (attempt >= this.maxAttempts) {
          return err(new ProviderBlockedError(YAHOO_PROVIDER_ID, cause));
        }
      }

      await this.waitBeforeRetry(attempt);
    }

    return err(new ProviderBlockedError(YAHOO_PROVIDER_ID));
  }

  private async waitBeforeRetry(attempt: number): Promise<void> {
    if (!this.retryDelayMs) {
      return;
    }

    const delayMs = this.retryDelayMs * 2 ** (attempt - 1);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

async function parseJson(
  response: Response,
  resource: string,
): Promise<ProviderResult<unknown>> {
  try {
    return ok(await response.json());
  } catch (cause) {
    return err(
      new ProviderParseError(
        YAHOO_PROVIDER_ID,
        `Yahoo ${resource} API response was not valid JSON`,
        cause,
      ),
    );
  }
}

export function createYahooClient(options?: YahooClientOptions): YahooClient {
  return new YahooClient(options);
}

export function createYahooProvider(
  options?: YahooClientOptions,
): YahooProvider {
  const client = createYahooClient(options);
  return {
    id: YAHOO_PROVIDER_ID,
    name: "Yahoo Fantasy Football",
    capabilities: YAHOO_PROVIDER_CAPABILITIES,
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
