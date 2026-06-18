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
  type NormalizedMemberRole,
  type NormalizedPostseasonSettings,
  type NormalizedSeasonBundle,
  type NormalizedTeam,
  type NormalizedTransaction,
  ProviderBlockedError,
  type ProviderLeagueRef,
  ProviderNotFoundError,
  ProviderParseError,
  type ProviderResult,
  RateLimitedError,
} from "../model";

export interface EspnCookieCredentials {
  swid: string;
  espn_s2: string;
}

export interface EspnSession extends FantasyProviderSession {
  provider: "espn";
  authKind: "cookie";
  subjectProviderId: string;
  swid: string;
  espn_s2: string;
}

export type EspnFetch = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface EspnDiscoveryClientOptions {
  fetch?: EspnFetch;
  maxAttempts?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
}

export type EspnProvider = Pick<
  FantasyProvider<EspnCookieCredentials, EspnSession>,
  | "authenticate"
  | "capabilities"
  | "discoverLeagues"
  | "getHistory"
  | "getLeague"
  | "getMatchups"
  | "getMembers"
  | "getTeams"
  | "getTransactions"
  | "id"
  | "name"
>;
export type EspnDiscoveryProvider = EspnProvider;

const ESPN_PROVIDER_ID = "espn";
const FAN_API_ORIGIN = "https://fan.api.espn.com";
const LEAGUE_API_ORIGIN = "https://lm-api-reads.fantasy.espn.com";
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 250;
const DEFAULT_TIMEOUT_MS = 10_000;
const ESPN_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const BRACED_SWID = /^\{[0-9A-Fa-f]{8}(-[0-9A-Fa-f]{4}){3}-[0-9A-Fa-f]{12}\}$/;
const UNBRACED_SWID = /^[0-9A-Fa-f]{8}(-[0-9A-Fa-f]{4}){3}-[0-9A-Fa-f]{12}$/;

export const ESPN_PROVIDER_CAPABILITIES: FantasyProviderCapabilities = {
  authKind: "cookie",
  dataClasses: {
    league: "full",
    teams: "full",
    members: "full",
    rosters: "none",
    matchups: "full",
    final_standings: "partial",
    transactions: "none",
    history: "partial",
    divisions: "partial",
    keeper_dynasty: "none",
    scoring_detail: "partial",
  },
  requiresOAuth: false,
  supportsHistory: true,
  supportsRosters: false,
  supportsTransactions: false,
};

const numericValue = z.union([z.number(), z.string()]);

const leagueSettingsSchema = z
  .object({
    name: z.string().optional(),
    scheduleSettings: z
      .object({
        divisions: z
          .array(
            z
              .object({
                id: numericValue.optional(),
                name: z.string().optional(),
              })
              .passthrough(),
          )
          .optional(),
        matchupPeriodCount: numericValue.optional(),
        playoffTeamCount: numericValue.optional(),
      })
      .passthrough()
      .optional(),
    scoringSettings: z
      .object({
        scoringType: z.string().optional(),
      })
      .passthrough()
      .optional(),
    size: numericValue.optional(),
  })
  .passthrough();

const leagueStatusSchema = z
  .object({
    firstScoringPeriod: numericValue.optional(),
    finalScoringPeriod: numericValue.optional(),
    isActive: z.boolean().optional(),
    isExpired: z.boolean().optional(),
    latestScoringPeriod: numericValue.optional(),
    teamsJoined: numericValue.optional(),
  })
  .passthrough();

const espnTeamSchema = z
  .object({
    abbrev: z.string().optional(),
    id: numericValue,
    divisionId: numericValue.optional(),
    location: z.string().optional(),
    logo: z.string().nullable().optional(),
    name: z.string().optional(),
    nickname: z.string().optional(),
    owners: z.array(z.string()).optional(),
    playoffSeed: numericValue.optional(),
    primaryOwner: z.string().nullable().optional(),
    rankCalculatedFinal: numericValue.optional(),
    rankFinal: numericValue.optional(),
    record: z
      .object({
        overall: z
          .object({
            losses: numericValue.optional(),
            pointsAgainst: numericValue.optional(),
            pointsFor: numericValue.optional(),
            ties: numericValue.optional(),
            wins: numericValue.optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const espnMemberSchema = z
  .object({
    displayName: z.string().optional(),
    firstName: z.string().optional(),
    id: z.string(),
    isLeagueCreator: z.boolean().optional(),
    isLeagueManager: z.boolean().optional(),
    lastName: z.string().optional(),
  })
  .passthrough();

const espnMatchupSideSchema = z
  .object({
    teamId: numericValue,
    totalPoints: numericValue.optional(),
  })
  .passthrough();

const espnMatchupSchema = z
  .object({
    away: espnMatchupSideSchema,
    home: espnMatchupSideSchema,
    id: numericValue,
    matchupPeriodId: numericValue,
    winner: z.string().optional(),
  })
  .passthrough();

const leagueApiResponseSchema = z
  .object({
    id: numericValue,
    members: z.array(espnMemberSchema).optional(),
    schedule: z.array(espnMatchupSchema).optional(),
    scoringPeriodId: numericValue.optional(),
    seasonId: numericValue,
    settings: leagueSettingsSchema.optional(),
    status: leagueStatusSchema.optional(),
    teams: z.array(espnTeamSchema).optional(),
  })
  .passthrough();

const leagueHistoryApiResponseSchema = z.array(leagueApiResponseSchema);

const fanLeagueGroupSchema = z
  .object({
    groupId: numericValue,
    groupName: z.string().optional(),
    groupSize: numericValue.optional(),
  })
  .passthrough();

const fanEntrySchema = z
  .object({
    abbrev: z.string().optional(),
    entryId: numericValue.optional(),
    entryMetadata: z
      .object({
        teamName: z.string().optional(),
      })
      .passthrough()
      .optional(),
    gameId: numericValue.optional(),
    groups: z.array(fanLeagueGroupSchema).optional(),
    name: z.string().optional(),
    seasonId: numericValue.optional(),
  })
  .passthrough();

const fanPreferenceSchema = z
  .object({
    metaData: z
      .object({
        entry: fanEntrySchema.optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const fanApiResponseSchema = z
  .object({
    id: z.string().optional(),
    preferences: z.array(fanPreferenceSchema).optional(),
  })
  .passthrough();

type EspnFanApiResponse = z.infer<typeof fanApiResponseSchema>;
type EspnLeagueApiResponse = z.infer<typeof leagueApiResponseSchema>;
type EspnLeagueHistoryApiResponse = z.infer<
  typeof leagueHistoryApiResponseSchema
>;
type EspnMatchup = z.infer<typeof espnMatchupSchema>;
type EspnMember = z.infer<typeof espnMemberSchema>;
type EspnTeam = z.infer<typeof espnTeamSchema>;
type NormalizedEspnCookies = Pick<EspnSession, "espn_s2" | "swid">;

function normalizeSwid(value: string): string | undefined {
  const trimmed = value.trim();
  if (BRACED_SWID.test(trimmed)) {
    return trimmed;
  }
  if (UNBRACED_SWID.test(trimmed)) {
    return `{${trimmed}}`;
  }
  return undefined;
}

function normalizeCredentials(
  credentials: EspnCookieCredentials,
): ProviderResult<NormalizedEspnCookies> {
  const swid = normalizeSwid(credentials.swid);
  const espnS2 = credentials.espn_s2.trim();

  if (!swid || !espnS2) {
    return err(new AuthExpiredError(ESPN_PROVIDER_ID));
  }

  return ok({ swid, espn_s2: espnS2 });
}

function toInteger(value: string | number | undefined): number | undefined {
  if (typeof value === "number") {
    return Number.isInteger(value) ? value : undefined;
  }
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function toNumber(value: string | number | undefined): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isFflEntry(entry: z.infer<typeof fanEntrySchema>): boolean {
  const gameId = toInteger(entry.gameId);
  return gameId === 1 || entry.abbrev?.toLowerCase() === "ffl";
}

function normalizeFanLeagues(fan: EspnFanApiResponse): ProviderLeagueRef[] {
  const leaguesByKey = new Map<string, ProviderLeagueRef>();

  for (const preference of fan.preferences ?? []) {
    const entry = preference.metaData?.entry;
    const season = toInteger(entry?.seasonId);
    if (!entry || !season || !isFflEntry(entry)) {
      continue;
    }

    for (const group of entry.groups ?? []) {
      const groupId = toInteger(group.groupId);
      if (!groupId) {
        continue;
      }

      const providerId = String(groupId);
      const key = `${season}:${providerId}`;
      leaguesByKey.set(key, {
        provider: ESPN_PROVIDER_ID,
        providerId,
        season,
        sport: "ffl",
        name: group.groupName ?? entry.name ?? `ESPN Fantasy League ${groupId}`,
        ...(entry.entryId === undefined
          ? {}
          : {
              providerTeamId: String(toInteger(entry.entryId) ?? entry.entryId),
            }),
        size: toInteger(group.groupSize),
        teamName: entry.entryMetadata?.teamName,
      });
    }
  }

  return [...leaguesByKey.values()].sort(
    (a, b) => b.season - a.season || a.name.localeCompare(b.name),
  );
}

function fanApiUrl(swid: string): string {
  return new URL(
    `/apis/v2/fans/${encodeURIComponent(swid)}`,
    FAN_API_ORIGIN,
  ).toString();
}

function currentLeagueApiUrl({
  ref,
  scoringPeriod,
  views,
}: {
  ref: ProviderLeagueRef;
  scoringPeriod?: number;
  views: string[];
}): string {
  const url = new URL(
    `/apis/v3/games/ffl/seasons/${ref.season}/segments/0/leagues/${ref.providerId}`,
    LEAGUE_API_ORIGIN,
  );

  for (const view of views) {
    url.searchParams.append("view", view);
  }
  if (scoringPeriod !== undefined) {
    url.searchParams.set("scoringPeriodId", String(scoringPeriod));
  }

  return url.toString();
}

function historyLeagueApiUrl({
  ref,
  season,
  views,
}: {
  ref: ProviderLeagueRef;
  season: number;
  views: string[];
}): string {
  const url = new URL(
    `/apis/v3/games/ffl/leagueHistory/${ref.providerId}`,
    LEAGUE_API_ORIGIN,
  );

  url.searchParams.set("seasonId", String(season));
  for (const view of views) {
    url.searchParams.append("view", view);
  }

  return url.toString();
}

function espnHeaders(session: Pick<EspnSession, "espn_s2" | "swid">) {
  return {
    Accept: "application/json",
    Cookie: `SWID=${session.swid}; espn_s2=${session.espn_s2}`,
    "User-Agent": ESPN_USER_AGENT,
    "x-fantasy-source": "kona",
    "x-fantasy-platform": "kona",
    "X-Personalization-Source": "ESPN.com - FAM",
  };
}

function shouldRetry(status: number): boolean {
  return status === 403 || status === 429 || status >= 500;
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
  if (response.status === 401) {
    return new AuthExpiredError(ESPN_PROVIDER_ID);
  }
  if (response.status === 404) {
    return new ProviderNotFoundError(ESPN_PROVIDER_ID, {
      resource,
    });
  }
  if (response.status === 429) {
    return new RateLimitedError(ESPN_PROVIDER_ID, retryAfterSeconds(response));
  }
  if (response.status === 403 || response.status >= 500) {
    return new ProviderBlockedError(ESPN_PROVIDER_ID);
  }
  return new ProviderParseError(
    ESPN_PROVIDER_ID,
    `ESPN ${resource} API returned HTTP ${response.status}`,
  );
}

function normalizeLeagueStatus(
  league: EspnLeagueApiResponse,
): NormalizedLeague["status"] {
  if (league.status?.isExpired) {
    return "complete";
  }

  const currentScoringPeriod = toInteger(league.scoringPeriodId);
  const firstScoringPeriod = toInteger(league.status?.firstScoringPeriod) ?? 1;
  if (
    currentScoringPeriod !== undefined &&
    currentScoringPeriod < firstScoringPeriod
  ) {
    return "preseason";
  }

  if (league.status?.isActive) {
    return "in_season";
  }

  return "unknown";
}

function positiveInteger(
  value: string | number | undefined,
): number | undefined {
  const parsed = toInteger(value);
  return parsed && parsed > 0 ? parsed : undefined;
}

function normalizePostseasonSettings(
  league: EspnLeagueApiResponse,
): NormalizedPostseasonSettings | undefined {
  const regularSeasonEnd = positiveInteger(
    league.settings?.scheduleSettings?.matchupPeriodCount,
  );
  const championshipScoringPeriod = positiveInteger(
    league.status?.finalScoringPeriod,
  );
  const playoffTeamCount = positiveInteger(
    league.settings?.scheduleSettings?.playoffTeamCount,
  );
  const settings: NormalizedPostseasonSettings = {
    ...(regularSeasonEnd
      ? {
          matchupPeriodCount: regularSeasonEnd,
          regularSeasonEndScoringPeriod: regularSeasonEnd,
          playoffStartScoringPeriod: regularSeasonEnd + 1,
        }
      : {}),
    ...(championshipScoringPeriod ? { championshipScoringPeriod } : {}),
    ...(playoffTeamCount ? { playoffTeamCount } : {}),
  };

  return Object.keys(settings).length > 0 ? settings : undefined;
}

function normalizeLeague(league: EspnLeagueApiResponse): NormalizedLeague {
  const providerId = String(toInteger(league.id) ?? league.id);
  const season = toInteger(league.seasonId) ?? 0;
  const currentScoringPeriod =
    toInteger(league.scoringPeriodId) ??
    toInteger(league.status?.latestScoringPeriod) ??
    0;
  const postseason = normalizePostseasonSettings(league);

  return {
    provider: ESPN_PROVIDER_ID,
    providerId,
    season,
    sport: "ffl",
    name: league.settings?.name?.trim() || `ESPN Fantasy League ${providerId}`,
    scoringType: league.settings?.scoringSettings?.scoringType ?? "unknown",
    scoringSettings: league.settings?.scoringSettings ?? {},
    size:
      toInteger(league.settings?.size) ??
      toInteger(league.status?.teamsJoined) ??
      0,
    currentScoringPeriod,
    status: normalizeLeagueStatus(league),
    ...(postseason ? { postseason } : {}),
  };
}

function divisionNameById(league: EspnLeagueApiResponse): Map<string, string> {
  return new Map(
    (league.settings?.scheduleSettings?.divisions ?? [])
      .map((division) => {
        const id = division.id === undefined ? undefined : String(division.id);
        const name = division.name?.trim();
        return id && name ? ([id, name] as const) : undefined;
      })
      .filter((entry): entry is readonly [string, string] => Boolean(entry)),
  );
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

function normalizeTeamName(team: EspnTeam): string {
  const directName = team.name?.trim();
  if (directName) {
    return directName;
  }

  const location = team.location?.trim();
  const nickname = team.nickname?.trim();
  if (location && nickname) {
    return `${location} ${nickname}`;
  }
  if (nickname) {
    return nickname;
  }
  if (location) {
    return location;
  }

  return `ESPN Team ${team.id}`;
}

function normalizeTeam(
  team: EspnTeam,
  league: ProviderLeagueRef,
  divisions = new Map<string, string>(),
): NormalizedTeam {
  const providerId = String(toInteger(team.id) ?? team.id);
  const divisionId =
    team.divisionId === undefined ? undefined : String(team.divisionId);
  const ownerMemberIds = compactUnique([
    ...(team.owners ?? []),
    team.primaryOwner ?? undefined,
  ]);
  const logo = team.logo?.trim();

  return {
    provider: ESPN_PROVIDER_ID,
    providerId,
    leagueProviderId: league.providerId,
    season: league.season,
    name: normalizeTeamName(team),
    abbrev: team.abbrev?.trim() || providerId,
    ...(divisionId
      ? { division: divisions.get(divisionId) ?? divisionId }
      : {}),
    ...(logo ? { logo } : {}),
    ownerMemberIds,
    record: {
      losses: toInteger(team.record?.overall?.losses) ?? 0,
      pointsAgainst: toNumber(team.record?.overall?.pointsAgainst) ?? 0,
      pointsFor: toNumber(team.record?.overall?.pointsFor) ?? 0,
      ties: toInteger(team.record?.overall?.ties) ?? 0,
      wins: toInteger(team.record?.overall?.wins) ?? 0,
    },
  };
}

function normalizeMemberDisplayName(member: EspnMember): string {
  const displayName = member.displayName?.trim();
  if (displayName) {
    return displayName;
  }

  const nameParts = [member.firstName, member.lastName]
    .map((value) => value?.trim())
    .filter(Boolean);
  if (nameParts.length > 0) {
    return nameParts.join(" ");
  }

  return `ESPN Member ${member.id}`;
}

function normalizeMemberRole(member: EspnMember): NormalizedMemberRole {
  if (member.isLeagueCreator) {
    return "commissioner";
  }
  if (member.isLeagueManager) {
    return "league_admin";
  }
  return "member";
}

function normalizeMember(
  member: EspnMember,
  league: ProviderLeagueRef,
): NormalizedMember {
  return {
    provider: ESPN_PROVIDER_ID,
    providerId: member.id,
    leagueProviderId: league.providerId,
    season: league.season,
    displayName: normalizeMemberDisplayName(member),
    role: normalizeMemberRole(member),
  };
}

function normalizeMatchupWinner(winner?: string): NormalizedMatchupWinner {
  switch (winner?.toUpperCase()) {
    case "HOME":
      return "home";
    case "AWAY":
      return "away";
    case "TIE":
      return "tie";
    case "UNDECIDED":
      return "unknown";
    default:
      return "unknown";
  }
}

function normalizeMatchupStatus(
  matchup: EspnMatchup,
  league: EspnLeagueApiResponse,
): NormalizedMatchupStatus {
  const winner = normalizeMatchupWinner(matchup.winner);
  if (winner !== "unknown") {
    return "final";
  }

  const scoringPeriod = toInteger(matchup.matchupPeriodId) ?? 0;
  const currentScoringPeriod =
    toInteger(league.scoringPeriodId) ??
    toInteger(league.status?.latestScoringPeriod);
  const homeScore = toNumber(matchup.home.totalPoints) ?? 0;
  const awayScore = toNumber(matchup.away.totalPoints) ?? 0;

  if (
    currentScoringPeriod !== undefined &&
    scoringPeriod === currentScoringPeriod &&
    (homeScore > 0 || awayScore > 0)
  ) {
    return "in_progress";
  }

  return matchup.winner?.toUpperCase() === "UNDECIDED"
    ? "scheduled"
    : "unknown";
}

function normalizeMatchup(
  matchup: EspnMatchup,
  leagueRef: ProviderLeagueRef,
  league: EspnLeagueApiResponse,
): NormalizedMatchup {
  const providerId = String(toInteger(matchup.id) ?? matchup.id);
  const scoringPeriod = toInteger(matchup.matchupPeriodId) ?? 0;
  const homeTeamId = String(
    toInteger(matchup.home.teamId) ?? matchup.home.teamId,
  );
  const awayTeamId = String(
    toInteger(matchup.away.teamId) ?? matchup.away.teamId,
  );

  return {
    provider: ESPN_PROVIDER_ID,
    providerId,
    leagueProviderId: leagueRef.providerId,
    season: leagueRef.season,
    scoringPeriod,
    periodStart: scoringPeriod,
    scoringPeriodSpan: 1,
    homeTeamRef: {
      provider: ESPN_PROVIDER_ID,
      providerId: homeTeamId,
      season: leagueRef.season,
    },
    awayTeamRef: {
      provider: ESPN_PROVIDER_ID,
      providerId: awayTeamId,
      season: leagueRef.season,
    },
    homeScore: toNumber(matchup.home.totalPoints) ?? 0,
    awayScore: toNumber(matchup.away.totalPoints) ?? 0,
    winner: normalizeMatchupWinner(matchup.winner),
    status: normalizeMatchupStatus(matchup, league),
  };
}

function finalStandingsFromTeams(
  teams: readonly NormalizedTeam[],
  sourceTeams: readonly EspnTeam[] = [],
): NormalizedFinalStanding[] {
  const rawTeamById = new Map(
    sourceTeams.map((team) => [String(toInteger(team.id) ?? team.id), team]),
  );
  const positiveRank = (value: string | number | undefined) => {
    const parsed = toInteger(value);
    return parsed && parsed > 0 ? parsed : undefined;
  };
  const providerRankFor = (
    team: NormalizedTeam,
  ): Pick<NormalizedFinalStanding, "rankConfidence" | "rankSource"> & {
    rank?: number;
  } => {
    const source = rawTeamById.get(team.providerId);
    const calculated = positiveRank(source?.rankCalculatedFinal);
    if (calculated) {
      return {
        rank: calculated,
        rankConfidence: "high",
        rankSource: "provider_calculated_final",
      };
    }
    const final = positiveRank(source?.rankFinal);
    if (final) {
      return {
        rank: final,
        rankConfidence: "high",
        rankSource: "provider_final",
      };
    }
    return {
      rankConfidence: "low",
      rankSource: "regular_season_fallback",
    };
  };
  const playoffSeedFor = (team: NormalizedTeam) => {
    const parsed = toInteger(rawTeamById.get(team.providerId)?.playoffSeed);
    return parsed && parsed > 0 ? parsed : undefined;
  };
  const fallbackSorted = [...teams].sort((left, right) => {
    const leftRecord = left.record;
    const rightRecord = right.record;
    return (
      rightRecord.wins - leftRecord.wins ||
      rightRecord.ties - leftRecord.ties ||
      rightRecord.pointsFor - leftRecord.pointsFor ||
      left.name.localeCompare(right.name) ||
      left.providerId.localeCompare(right.providerId)
    );
  });
  const fallbackRankByTeam = new Map(
    fallbackSorted.map((team, index) => [team.providerId, index + 1]),
  );
  const rankByTeam = new Map(
    teams.map((team) => [team.providerId, providerRankFor(team)]),
  );

  return [...teams]
    .sort((left, right) => {
      const leftRank =
        rankByTeam.get(left.providerId)?.rank ??
        fallbackRankByTeam.get(left.providerId) ??
        0;
      const rightRank =
        rankByTeam.get(right.providerId)?.rank ??
        fallbackRankByTeam.get(right.providerId) ??
        0;
      return (
        leftRank - rightRank ||
        left.name.localeCompare(right.name) ||
        left.providerId.localeCompare(right.providerId)
      );
    })
    .map((team, index) => {
      const rank = rankByTeam.get(team.providerId) ?? {
        rankConfidence: "low" as const,
        rankSource: "regular_season_fallback" as const,
      };
      return {
        leagueProviderId: team.leagueProviderId,
        teamRef: {
          provider: team.provider,
          providerId: team.providerId,
          season: team.season,
        },
        ...(team.division ? { division: team.division } : {}),
        rank: rank.rank ?? fallbackRankByTeam.get(team.providerId) ?? index + 1,
        rankConfidence: rank.rankConfidence,
        rankSource: rank.rankSource,
        ...(playoffSeedFor(team) ? { playoffSeed: playoffSeedFor(team) } : {}),
        wins: team.record.wins,
        losses: team.record.losses,
        ties: team.record.ties,
        pointsFor: team.record.pointsFor,
        pointsAgainst: team.record.pointsAgainst,
      };
    });
}

function normalizeHistoryBundle(
  league: EspnLeagueApiResponse,
  ref: ProviderLeagueRef,
): NormalizedSeasonBundle {
  const normalizedLeague = normalizeLeague(league);
  const seasonRef = {
    ...ref,
    name: normalizedLeague.name,
    season: normalizedLeague.season,
    size: normalizedLeague.size,
  };
  const divisions = divisionNameById(league);
  const teams = (league.teams ?? []).map((team) =>
    normalizeTeam(team, seasonRef, divisions),
  );
  const members = (league.members ?? []).map((member) =>
    normalizeMember(member, seasonRef),
  );
  const matchups = (league.schedule ?? []).map((matchup) =>
    normalizeMatchup(matchup, seasonRef, league),
  );

  return {
    league: normalizedLeague,
    teams,
    members,
    matchups,
    finalStandings: finalStandingsFromTeams(teams, league.teams ?? []),
    transactions: [],
  };
}

function createSession(
  cookies: NormalizedEspnCookies,
  fan: EspnFanApiResponse,
): EspnSession {
  return {
    provider: ESPN_PROVIDER_ID,
    authKind: "cookie",
    subjectProviderId: fan.id?.trim() || cookies.swid,
    swid: cookies.swid,
    espn_s2: cookies.espn_s2,
  };
}

export class EspnDiscoveryClient {
  private readonly fetchImpl: EspnFetch;
  private readonly maxAttempts: number;
  private readonly retryDelayMs: number;
  private readonly timeoutMs: number;

  constructor(options: EspnDiscoveryClientOptions = {}) {
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.maxAttempts = Math.max(1, options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
    this.retryDelayMs = Math.max(
      0,
      options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS,
    );
    this.timeoutMs = Math.max(1, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  }

  async authenticate(
    credentials: EspnCookieCredentials,
  ): Promise<ProviderResult<EspnSession>> {
    const cookies = normalizeCredentials(credentials);
    if (!cookies.ok) {
      return cookies;
    }

    const fan = await this.fetchFanApi(cookies.value);
    if (!fan.ok) {
      return fan;
    }

    return ok(createSession(cookies.value, fan.value));
  }

  async discoverLeagues(
    session: EspnSession,
  ): Promise<ProviderResult<ProviderLeagueRef[]>> {
    const fan = await this.fetchFanApi(session);
    if (!fan.ok) {
      return fan;
    }

    return ok(normalizeFanLeagues(fan.value));
  }

  async getLeague(
    session: EspnSession,
    ref: ProviderLeagueRef,
  ): Promise<ProviderResult<NormalizedLeague>> {
    const league = await this.fetchCurrentLeagueApi({
      ref,
      resource: "league",
      session,
      views: ["mSettings"],
    });
    if (!league.ok) {
      return league;
    }

    return ok(normalizeLeague(league.value));
  }

  async getTeams(
    session: EspnSession,
    ref: ProviderLeagueRef,
  ): Promise<ProviderResult<NormalizedTeam[]>> {
    const league = await this.fetchCurrentLeagueApi({
      ref,
      resource: "league-teams",
      session,
      views: ["mTeam", "mStandings"],
    });
    if (!league.ok) {
      return league;
    }

    return ok(
      (league.value.teams ?? []).map((team) =>
        normalizeTeam(team, ref, divisionNameById(league.value)),
      ),
    );
  }

  async getMembers(
    session: EspnSession,
    ref: ProviderLeagueRef,
  ): Promise<ProviderResult<NormalizedMember[]>> {
    const league = await this.fetchCurrentLeagueApi({
      ref,
      resource: "league-members",
      session,
      views: ["mMembers"],
    });
    if (!league.ok) {
      return league;
    }

    return ok(
      (league.value.members ?? []).map((member) =>
        normalizeMember(member, ref),
      ),
    );
  }

  async getMatchups(
    session: EspnSession,
    ref: ProviderLeagueRef,
    scoringPeriod?: number,
  ): Promise<ProviderResult<NormalizedMatchup[]>> {
    const league = await this.fetchCurrentLeagueApi({
      ref,
      resource: "league-matchups",
      scoringPeriod,
      session,
      views: ["mMatchup", "mMatchupScore"],
    });
    if (!league.ok) {
      return league;
    }

    const matchups = (league.value.schedule ?? [])
      .filter((matchup) => {
        if (scoringPeriod === undefined) {
          return true;
        }
        return toInteger(matchup.matchupPeriodId) === scoringPeriod;
      })
      .map((matchup) => normalizeMatchup(matchup, ref, league.value));

    return ok(matchups);
  }

  async getTransactions(
    _session: EspnSession,
    _ref: ProviderLeagueRef,
  ): Promise<ProviderResult<NormalizedTransaction[]>> {
    return ok([]);
  }

  async getHistory(
    session: EspnSession,
    ref: ProviderLeagueRef,
    options: { seasons: number[] },
  ): Promise<ProviderResult<NormalizedSeasonBundle[]>> {
    const seasons = [...new Set(options.seasons)]
      .filter((season) => Number.isInteger(season))
      .sort((left, right) => right - left);
    const bundles: NormalizedSeasonBundle[] = [];

    for (const season of seasons) {
      const history = await this.fetchHistoricalLeagueApi({
        ref,
        resource: "league-history",
        season,
        session,
        views: [
          "mSettings",
          "mTeam",
          "mStandings",
          "mMembers",
          "mMatchup",
          "mMatchupScore",
        ],
      });
      if (!history.ok) {
        return err(history.error);
      }

      for (const league of history.value) {
        bundles.push(normalizeHistoryBundle(league, ref));
      }
    }

    return ok(
      bundles.sort((left, right) => right.league.season - left.league.season),
    );
  }

  private async fetchFanApi(
    session: Pick<EspnSession, "espn_s2" | "swid">,
  ): Promise<ProviderResult<EspnFanApiResponse>> {
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        const response = await this.fetchImpl(fanApiUrl(session.swid), {
          cache: "no-store",
          headers: espnHeaders(session),
          method: "GET",
          signal: AbortSignal.timeout(this.timeoutMs),
        });

        if (response.ok) {
          return await parseFanApiResponse(response);
        }

        const providerError = errorForStatus(response, "fan");
        if (!shouldRetry(response.status) || attempt >= this.maxAttempts) {
          return err(providerError);
        }
      } catch (cause) {
        if (attempt >= this.maxAttempts) {
          return err(new ProviderBlockedError(ESPN_PROVIDER_ID, cause));
        }
      }

      await this.waitBeforeRetry(attempt);
    }

    return err(new ProviderBlockedError(ESPN_PROVIDER_ID));
  }

  private async fetchCurrentLeagueApi({
    ref,
    resource,
    scoringPeriod,
    session,
    views,
  }: {
    ref: ProviderLeagueRef;
    resource: string;
    scoringPeriod?: number;
    session: EspnSession;
    views: string[];
  }): Promise<ProviderResult<EspnLeagueApiResponse>> {
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        const response = await this.fetchImpl(
          currentLeagueApiUrl({ ref, scoringPeriod, views }),
          {
            cache: "no-store",
            headers: espnHeaders(session),
            method: "GET",
            signal: AbortSignal.timeout(this.timeoutMs),
          },
        );

        if (response.ok) {
          return await parseLeagueApiResponse(response);
        }

        const providerError = errorForStatus(response, resource);
        if (!shouldRetry(response.status) || attempt >= this.maxAttempts) {
          return err(providerError);
        }
      } catch (cause) {
        if (attempt >= this.maxAttempts) {
          return err(new ProviderBlockedError(ESPN_PROVIDER_ID, cause));
        }
      }

      await this.waitBeforeRetry(attempt);
    }

    return err(new ProviderBlockedError(ESPN_PROVIDER_ID));
  }

  private async fetchHistoricalLeagueApi({
    ref,
    resource,
    season,
    session,
    views,
  }: {
    ref: ProviderLeagueRef;
    resource: string;
    season: number;
    session: EspnSession;
    views: string[];
  }): Promise<ProviderResult<EspnLeagueHistoryApiResponse>> {
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        const response = await this.fetchImpl(
          historyLeagueApiUrl({ ref, season, views }),
          {
            cache: "no-store",
            headers: espnHeaders(session),
            method: "GET",
            signal: AbortSignal.timeout(this.timeoutMs),
          },
        );

        if (response.ok) {
          return await parseLeagueHistoryApiResponse(response);
        }

        const providerError = errorForStatus(response, resource);
        if (!shouldRetry(response.status) || attempt >= this.maxAttempts) {
          return err(providerError);
        }
      } catch (cause) {
        if (attempt >= this.maxAttempts) {
          return err(new ProviderBlockedError(ESPN_PROVIDER_ID, cause));
        }
      }

      await this.waitBeforeRetry(attempt);
    }

    return err(new ProviderBlockedError(ESPN_PROVIDER_ID));
  }

  private async waitBeforeRetry(attempt: number): Promise<void> {
    if (!this.retryDelayMs) {
      return;
    }

    const delayMs = this.retryDelayMs * 2 ** (attempt - 1);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

async function parseFanApiResponse(
  response: Response,
): Promise<ProviderResult<EspnFanApiResponse>> {
  try {
    const json = (await response.json()) as unknown;
    const parsed = fanApiResponseSchema.safeParse(json);
    if (!parsed.success) {
      return err(
        new ProviderParseError(
          ESPN_PROVIDER_ID,
          "ESPN Fan API returned an unexpected shape",
          parsed.error,
        ),
      );
    }
    return ok(parsed.data);
  } catch (cause) {
    return err(
      new ProviderParseError(
        ESPN_PROVIDER_ID,
        "ESPN Fan API response was not valid JSON",
        cause,
      ),
    );
  }
}

async function parseLeagueApiResponse(
  response: Response,
): Promise<ProviderResult<EspnLeagueApiResponse>> {
  try {
    const json = (await response.json()) as unknown;
    const parsed = leagueApiResponseSchema.safeParse(json);
    if (!parsed.success) {
      return err(
        new ProviderParseError(
          ESPN_PROVIDER_ID,
          "ESPN League API returned an unexpected shape",
          parsed.error,
        ),
      );
    }
    return ok(parsed.data);
  } catch (cause) {
    return err(
      new ProviderParseError(
        ESPN_PROVIDER_ID,
        "ESPN League API response was not valid JSON",
        cause,
      ),
    );
  }
}

async function parseLeagueHistoryApiResponse(
  response: Response,
): Promise<ProviderResult<EspnLeagueHistoryApiResponse>> {
  try {
    const json = (await response.json()) as unknown;
    const parsed = leagueHistoryApiResponseSchema.safeParse(json);
    if (!parsed.success) {
      return err(
        new ProviderParseError(
          ESPN_PROVIDER_ID,
          "ESPN League History API returned an unexpected shape",
          parsed.error,
        ),
      );
    }
    return ok(parsed.data);
  } catch (cause) {
    return err(
      new ProviderParseError(
        ESPN_PROVIDER_ID,
        "ESPN League History API response was not valid JSON",
        cause,
      ),
    );
  }
}

export function createEspnDiscoveryClient(
  options?: EspnDiscoveryClientOptions,
): EspnDiscoveryClient {
  return new EspnDiscoveryClient(options);
}

export function createEspnDiscoveryProvider(
  options?: EspnDiscoveryClientOptions,
): EspnDiscoveryProvider {
  const client = createEspnDiscoveryClient(options);
  return {
    id: ESPN_PROVIDER_ID,
    name: "ESPN Fantasy Football",
    capabilities: ESPN_PROVIDER_CAPABILITIES,
    authenticate: (credentials) => client.authenticate(credentials),
    discoverLeagues: (session) => client.discoverLeagues(session),
    getHistory: (session, ref, options) =>
      client.getHistory(session, ref, options),
    getLeague: (session, ref) => client.getLeague(session, ref),
    getMatchups: (session, ref, scoringPeriod) =>
      client.getMatchups(session, ref, scoringPeriod),
    getMembers: (session, ref) => client.getMembers(session, ref),
    getTeams: (session, ref) => client.getTeams(session, ref),
    getTransactions: (session, ref) => client.getTransactions(session, ref),
  };
}
