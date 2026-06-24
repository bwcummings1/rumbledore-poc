import { z } from "zod";
import { err, ok } from "@/core/result";
import {
  AuthExpiredError,
  type FantasyProvider,
  type FantasyProviderCapabilities,
  type FantasyProviderSession,
  type NormalizedAcquisitionSettings,
  type NormalizedDraftPick,
  type NormalizedFinalStanding,
  type NormalizedJsonObject,
  type NormalizedLeague,
  type NormalizedMatchup,
  type NormalizedMatchupStatus,
  type NormalizedMatchupWinner,
  type NormalizedMember,
  type NormalizedMemberRole,
  type NormalizedPlayer,
  type NormalizedPostseasonSettings,
  type NormalizedRoster,
  type NormalizedRosterSettings,
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
import {
  decodeEspnActivityValue,
  decodeEspnLineupSlotId,
  decodeEspnPositionId,
  decodeEspnProTeamId,
  decodeEspnScoringStatId,
  espnLineupSlotIsStarted,
} from "./reference-data";

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
  | "getDraftPicks"
  | "getRosters"
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
    rosters: "partial",
    matchups: "full",
    final_standings: "partial",
    transactions: "partial",
    history: "partial",
    divisions: "partial",
    keeper_dynasty: "none",
    scoring_detail: "partial",
  },
  requiresOAuth: false,
  supportsHistory: true,
  supportsRosters: true,
  supportsTransactions: true,
};

const numericValue = z.union([z.number(), z.string()]);
const acquisitionTypeValue = z.union([z.number(), z.string()]);

const leagueSettingsSchema = z
  .object({
    acquisitionSettings: z
      .object({
        acquisitionBudget: numericValue.optional(),
        acquisitionType: acquisitionTypeValue.optional(),
        budget: numericValue.optional(),
        waiverBudget: numericValue.optional(),
      })
      .passthrough()
      .optional(),
    name: z.string().optional(),
    rosterSettings: z
      .object({
        lineupSlotCounts: z.record(z.string(), numericValue).optional(),
      })
      .passthrough()
      .optional(),
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
        matchupPeriodLength: numericValue.optional(),
        matchupPeriods: z.record(z.string(), z.array(numericValue)).optional(),
        playoffMatchupPeriodLength: numericValue.optional(),
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
    pointsByScoringPeriod: z.record(z.string(), numericValue).optional(),
    teamId: numericValue,
    totalPoints: numericValue.optional(),
  })
  .passthrough();

const espnMatchupSchema = z
  .object({
    away: espnMatchupSideSchema.optional(),
    home: espnMatchupSideSchema,
    id: numericValue.optional(),
    matchupPeriodId: numericValue,
    scoringPeriodId: numericValue.optional(),
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
type EspnHeadToHeadMatchup = EspnMatchup;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function recordValue(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined;
}

function recordArray(value: unknown, key: string): Record<string, unknown>[] {
  const nested = recordValue(value, key);
  return Array.isArray(nested) ? nested.filter(isRecord) : [];
}

function numberFromUnknown(value: unknown): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === "string" && value.length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function stringFromUnknown(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

function booleanFromUnknown(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function positiveProviderId(value: unknown): string | undefined {
  const numeric = numberFromUnknown(value);
  if (numeric !== undefined && numeric !== 0 && numeric !== -1) {
    return String(Math.trunc(numeric));
  }
  const stringValue = stringFromUnknown(value);
  if (!stringValue || stringValue === "0" || stringValue === "-1") {
    return undefined;
  }
  return stringValue;
}

function sortedUniquePositiveIntegers(
  values: Iterable<number | undefined>,
): number[] {
  return [...new Set(values)]
    .filter(
      (value): value is number =>
        value !== undefined && Number.isInteger(value) && value > 0,
    )
    .sort((left, right) => left - right);
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
      const providerId = providerIdFromValue(group.groupId);
      if (!providerId) {
        continue;
      }

      const key = `${season}:${providerId}`;
      leaguesByKey.set(key, {
        provider: ESPN_PROVIDER_ID,
        providerId,
        season,
        sport: "ffl",
        name:
          group.groupName ?? entry.name ?? `ESPN Fantasy League ${providerId}`,
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
  scoringPeriod,
  season,
  views,
}: {
  ref: ProviderLeagueRef;
  scoringPeriod?: number;
  season: number;
  views: string[];
}): string {
  const url = new URL(
    `/apis/v3/games/ffl/leagueHistory/${ref.providerId}`,
    LEAGUE_API_ORIGIN,
  );

  url.searchParams.set("seasonId", String(season));
  if (scoringPeriod !== undefined) {
    url.searchParams.set("scoringPeriodId", String(scoringPeriod));
  }
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

function scheduleFilterHeader(scoringPeriod: number): Record<string, string> {
  return {
    "x-fantasy-filter": JSON.stringify({
      schedule: {
        filterMatchupPeriodIds: {
          value: [scoringPeriod],
        },
      },
    }),
  };
}

function transactionFilterHeader(): Record<string, string> {
  return {
    "x-fantasy-filter": JSON.stringify({
      transactions: {
        filterType: {
          value: ["FREEAGENT", "WAIVER", "WAIVER_ERROR"],
        },
      },
    }),
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

function normalizeLineupSlotCounts(
  counts: Record<string, string | number> | undefined,
): Record<string, number> | undefined {
  if (!counts) {
    return undefined;
  }

  const normalized = Object.fromEntries(
    Object.entries(counts)
      .map(([slotId, value]) => {
        const count = toInteger(value);
        return count === undefined || count < 0 ? undefined : [slotId, count];
      })
      .filter((entry): entry is [string, number] => Boolean(entry)),
  );

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function providerIdFromValue(
  value: string | number | undefined,
): string | null {
  if (value === undefined) {
    return null;
  }
  const providerId = String(toInteger(value) ?? value).trim();
  return providerId.length > 0 ? providerId : null;
}

function normalizeRosterSettings(
  league: EspnLeagueApiResponse,
): NormalizedRosterSettings | undefined {
  const lineupSlotCounts = normalizeLineupSlotCounts(
    league.settings?.rosterSettings?.lineupSlotCounts,
  );
  if (!lineupSlotCounts) {
    return undefined;
  }

  return {
    lineupSlotCounts,
    source: "espn.settings.rosterSettings",
  };
}

function normalizeAcquisitionSettings(
  league: EspnLeagueApiResponse,
): NormalizedAcquisitionSettings | undefined {
  const settings = league.settings?.acquisitionSettings;
  if (!settings) {
    return undefined;
  }

  const acquisitionType =
    settings.acquisitionType === undefined
      ? undefined
      : String(settings.acquisitionType).trim();
  const acquisitionBudget =
    toInteger(settings.acquisitionBudget) ??
    toInteger(settings.waiverBudget) ??
    toInteger(settings.budget);
  const {
    acquisitionBudget: _rawAcquisitionBudget,
    acquisitionType: _rawAcquisitionType,
    ...rawSettings
  } = settings;

  return {
    ...rawSettings,
    ...(acquisitionType ? { acquisitionType } : {}),
    ...(acquisitionBudget === undefined ? {} : { acquisitionBudget }),
    source: "espn.settings.acquisitionSettings",
  };
}

function normalizeScoringSettings(
  scoringSettings: Record<string, unknown> | undefined,
): NormalizedJsonObject {
  if (!scoringSettings) {
    return {};
  }

  const scoringItems = recordArray(scoringSettings, "scoringItems").map(
    (item) => {
      const statId = numberFromUnknown(recordValue(item, "statId"));
      const decoded =
        statId === undefined ? undefined : decodeEspnScoringStatId(statId);
      return {
        ...item,
        ...(statId === undefined ? {} : { providerStatId: statId }),
        ...(decoded
          ? {
              statCategory: decoded.category,
              statKey: decoded.key,
            }
          : {}),
      };
    },
  );

  return {
    ...scoringSettings,
    ...(scoringItems.length > 0 ? { scoringItems } : {}),
  };
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
  const playoffMatchupPeriodLength = positiveInteger(
    league.settings?.scheduleSettings?.playoffMatchupPeriodLength,
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
    ...(playoffMatchupPeriodLength ? { playoffMatchupPeriodLength } : {}),
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
  const acquisitionSettings = normalizeAcquisitionSettings(league);
  const postseason = normalizePostseasonSettings(league);
  const rosterSettings = normalizeRosterSettings(league);

  return {
    provider: ESPN_PROVIDER_ID,
    providerId,
    season,
    sport: "ffl",
    name: league.settings?.name?.trim() || `ESPN Fantasy League ${providerId}`,
    scoringType: league.settings?.scoringSettings?.scoringType ?? "unknown",
    scoringSettings: normalizeScoringSettings(league.settings?.scoringSettings),
    size:
      toInteger(league.settings?.size) ??
      toInteger(league.status?.teamsJoined) ??
      0,
    currentScoringPeriod,
    status: normalizeLeagueStatus(league),
    ...(acquisitionSettings ? { acquisitionSettings } : {}),
    ...(postseason ? { postseason } : {}),
    ...(rosterSettings ? { rosterSettings } : {}),
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
  matchup: EspnHeadToHeadMatchup,
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
  const awayScore = toNumber(matchup.away?.totalPoints) ?? 0;
  const hasAway = matchup.away !== undefined;
  if (
    !hasAway &&
    (league.status?.isExpired ||
      league.status?.isActive === false ||
      (currentScoringPeriod !== undefined &&
        scoringPeriod < currentScoringPeriod))
  ) {
    return "final";
  }

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

function matchupPeriodIdsFromSettings(
  matchup: EspnHeadToHeadMatchup,
  league: EspnLeagueApiResponse,
): number[] {
  const matchupPeriod = toInteger(matchup.matchupPeriodId);
  if (matchupPeriod === undefined) {
    return [];
  }

  const rawPeriods =
    league.settings?.scheduleSettings?.matchupPeriods?.[String(matchupPeriod)];
  return sortedUniquePositiveIntegers((rawPeriods ?? []).map(toInteger));
}

function matchupSideScoringPeriods(
  side: EspnHeadToHeadMatchup["home"] | EspnHeadToHeadMatchup["away"],
): number[] {
  return sortedUniquePositiveIntegers(
    Object.keys(side?.pointsByScoringPeriod ?? {}).map((key) => toInteger(key)),
  );
}

function matchupScoringPeriods(
  matchup: EspnHeadToHeadMatchup,
  league: EspnLeagueApiResponse,
): number[] {
  const matchupPeriod = toInteger(matchup.matchupPeriodId);
  return sortedUniquePositiveIntegers([
    ...matchupPeriodIdsFromSettings(matchup, league),
    ...matchupSideScoringPeriods(matchup.home),
    ...matchupSideScoringPeriods(matchup.away),
    toInteger(matchup.scoringPeriodId),
    matchupPeriod,
  ]);
}

function matchupWindow(
  matchups: readonly EspnHeadToHeadMatchup[],
  league: EspnLeagueApiResponse,
): { periodStart: number; scoringPeriodSpan: number } {
  const periods = sortedUniquePositiveIntegers(
    matchups.flatMap((matchup) => matchupScoringPeriods(matchup, league)),
  );
  const fallback = toInteger(matchups[0]?.matchupPeriodId) ?? 0;
  const periodStart = periods[0] ?? fallback;
  const periodEnd = periods.at(-1) ?? periodStart;
  return {
    periodStart,
    scoringPeriodSpan: Math.max(1, periodEnd - periodStart + 1),
  };
}

function matchupProviderId(matchup: EspnHeadToHeadMatchup): string {
  const explicitId =
    matchup.id === undefined
      ? undefined
      : String(toInteger(matchup.id) ?? matchup.id);
  if (explicitId) {
    return explicitId;
  }

  const matchupPeriod = toInteger(matchup.matchupPeriodId) ?? 0;
  const homeTeamId = String(
    toInteger(matchup.home.teamId) ?? matchup.home.teamId,
  );
  const awayTeamId = String(
    toInteger(matchup.away?.teamId) ?? matchup.away?.teamId ?? "bye",
  );
  return `${matchupPeriod}:${homeTeamId}:${awayTeamId}`;
}

function matchupGroupKey(matchup: EspnHeadToHeadMatchup): string {
  const matchupPeriod = toInteger(matchup.matchupPeriodId) ?? 0;
  return `${matchupProviderId(matchup)}:${matchupPeriod}`;
}

function matchupMatchesScoringPeriod(
  matchups: readonly EspnHeadToHeadMatchup[],
  league: EspnLeagueApiResponse,
  scoringPeriod: number,
): boolean {
  return matchups.some((matchup) =>
    matchupScoringPeriods(matchup, league).includes(scoringPeriod),
  );
}

function latestMatchupRow(
  matchups: readonly EspnHeadToHeadMatchup[],
  league: EspnLeagueApiResponse,
): EspnHeadToHeadMatchup {
  const sorted = [...matchups].sort((left, right) => {
    const leftPeriods = matchupScoringPeriods(left, league);
    const rightPeriods = matchupScoringPeriods(right, league);
    const leftEnd = leftPeriods.at(-1) ?? 0;
    const rightEnd = rightPeriods.at(-1) ?? 0;
    return (
      leftEnd - rightEnd ||
      (toInteger(left.scoringPeriodId) ?? 0) -
        (toInteger(right.scoringPeriodId) ?? 0) ||
      matchupProviderId(left).localeCompare(
        matchupProviderId(right),
        undefined,
        {
          numeric: true,
        },
      )
    );
  });
  const latest = sorted.at(-1);
  if (!latest) {
    throw new Error("cannot normalize empty ESPN matchup group");
  }
  return latest;
}

function normalizeMatchup(
  matchups: readonly EspnHeadToHeadMatchup[],
  leagueRef: ProviderLeagueRef,
  league: EspnLeagueApiResponse,
): NormalizedMatchup {
  const matchup = latestMatchupRow(matchups, league);
  const providerId = matchupProviderId(matchup);
  const scoringPeriod = toInteger(matchup.matchupPeriodId) ?? 0;
  const window = matchupWindow(matchups, league);
  const homeTeamId = String(
    toInteger(matchup.home.teamId) ?? matchup.home.teamId,
  );
  const awayTeamId =
    matchup.away === undefined
      ? undefined
      : String(toInteger(matchup.away.teamId) ?? matchup.away.teamId);
  const isBye = awayTeamId === undefined;

  return {
    provider: ESPN_PROVIDER_ID,
    providerId,
    leagueProviderId: leagueRef.providerId,
    season: leagueRef.season,
    scoringPeriod,
    periodStart: window.periodStart,
    scoringPeriodSpan: window.scoringPeriodSpan,
    homeTeamRef: {
      provider: ESPN_PROVIDER_ID,
      providerId: homeTeamId,
      season: leagueRef.season,
    },
    ...(awayTeamId
      ? {
          awayTeamRef: {
            provider: ESPN_PROVIDER_ID,
            providerId: awayTeamId,
            season: leagueRef.season,
          },
        }
      : {}),
    homeScore: toNumber(matchup.home.totalPoints) ?? 0,
    ...(awayTeamId
      ? { awayScore: toNumber(matchup.away?.totalPoints) ?? 0 }
      : {}),
    winner: isBye ? "unknown" : normalizeMatchupWinner(matchup.winner),
    status: normalizeMatchupStatus(matchup, league),
  };
}

function isMatchupFact(matchup: EspnMatchup): matchup is EspnHeadToHeadMatchup {
  return matchup.home !== undefined;
}

function normalizeScheduleMatchups(
  schedule: readonly EspnMatchup[],
  leagueRef: ProviderLeagueRef,
  league: EspnLeagueApiResponse,
  scoringPeriod?: number,
): NormalizedMatchup[] {
  const grouped = new Map<string, EspnHeadToHeadMatchup[]>();
  for (const matchup of schedule) {
    if (!isMatchupFact(matchup)) {
      continue;
    }
    const key = matchupGroupKey(matchup);
    grouped.set(key, [...(grouped.get(key) ?? []), matchup]);
  }

  return [...grouped.values()]
    .filter(
      (matchups) =>
        scoringPeriod === undefined ||
        matchupMatchesScoringPeriod(matchups, league, scoringPeriod),
    )
    .map((matchups) => normalizeMatchup(matchups, leagueRef, league));
}

function normalizeEspnPlayer(
  value: unknown,
  league: ProviderLeagueRef,
  fallbackId?: unknown,
): NormalizedPlayer | undefined {
  const player = isRecord(recordValue(value, "player"))
    ? recordValue(value, "player")
    : isRecord(recordValue(value, "playerPoolEntry"))
      ? recordValue(recordValue(value, "playerPoolEntry"), "player")
      : value;
  if (!isRecord(player)) {
    const providerId = positiveProviderId(fallbackId);
    if (!providerId) {
      return undefined;
    }
    return {
      provider: ESPN_PROVIDER_ID,
      providerId,
      leagueProviderId: league.providerId,
      fullName: `ESPN Player ${providerId}`,
      position: "unknown",
    };
  }

  const providerId =
    positiveProviderId(recordValue(player, "id")) ??
    positiveProviderId(fallbackId);
  if (!providerId) {
    return undefined;
  }
  const defaultPositionId = numberFromUnknown(
    recordValue(player, "defaultPositionId"),
  );
  const proTeamId = numberFromUnknown(recordValue(player, "proTeamId"));
  const position =
    defaultPositionId === undefined
      ? undefined
      : decodeEspnPositionId(defaultPositionId);
  const proTeam =
    proTeamId === undefined ? undefined : decodeEspnProTeamId(proTeamId);
  const eligibleSlots = Array.isArray(recordValue(player, "eligibleSlots"))
    ? (recordValue(player, "eligibleSlots") as unknown[])
        .map(numberFromUnknown)
        .filter((slotId): slotId is number => slotId !== undefined)
    : [];
  const fullName =
    stringFromUnknown(recordValue(player, "fullName")) ??
    [recordValue(player, "firstName"), recordValue(player, "lastName")]
      .map(stringFromUnknown)
      .filter(Boolean)
      .join(" ")
      .trim() ??
    `ESPN Player ${providerId}`;
  const injuryStatus = stringFromUnknown(recordValue(player, "injuryStatus"));
  const injured = booleanFromUnknown(recordValue(player, "injured"));

  return {
    provider: ESPN_PROVIDER_ID,
    providerId,
    leagueProviderId: league.providerId,
    fullName: fullName || `ESPN Player ${providerId}`,
    position: position ?? "unknown",
    ...(proTeamId === undefined ? {} : { proTeam: proTeam ?? "unknown" }),
    ...(injuryStatus || injured !== undefined
      ? { status: injuryStatus ?? (injured ? "injured" : "active") }
      : {}),
    metadata: {
      ...(defaultPositionId === undefined ? {} : { defaultPositionId }),
      ...(proTeamId === undefined ? {} : { proTeamId }),
      eligibleSlots,
      eligibleSlotLabels: eligibleSlots.map(
        (slotId) => decodeEspnLineupSlotId(slotId) ?? "unknown",
      ),
    },
  };
}

function playerMapFromLeague(
  league: EspnLeagueApiResponse,
  ref: ProviderLeagueRef,
): Map<string, NormalizedPlayer> {
  const players = recordArray(league, "players")
    .map((row) => normalizeEspnPlayer(row, ref, recordValue(row, "id")))
    .filter((player): player is NormalizedPlayer => Boolean(player));
  return new Map(players.map((player) => [player.providerId, player]));
}

function statAppliedTotal(
  playerRecord: Record<string, unknown>,
  scoringPeriod: number,
  statSourceId: number,
): number | undefined {
  for (const stat of recordArray(playerRecord, "stats")) {
    const source = numberFromUnknown(recordValue(stat, "statSourceId"));
    if (source !== statSourceId) {
      continue;
    }
    const period = numberFromUnknown(recordValue(stat, "scoringPeriodId"));
    if (period !== undefined && period !== scoringPeriod && period !== 0) {
      continue;
    }
    const appliedTotal = numberFromUnknown(recordValue(stat, "appliedTotal"));
    if (appliedTotal !== undefined) {
      return appliedTotal;
    }
  }
  return undefined;
}

function normalizeRosterEntry(
  entry: Record<string, unknown>,
  league: ProviderLeagueRef,
  scoringPeriod: number,
): NormalizedRoster["entries"][number] | undefined {
  const playerPoolEntry = recordValue(entry, "playerPoolEntry");
  const playerRecord = isRecord(playerPoolEntry)
    ? recordValue(playerPoolEntry, "player")
    : undefined;
  const player =
    normalizeEspnPlayer(
      isRecord(playerRecord) ? playerRecord : entry,
      league,
      recordValue(entry, "playerId"),
    ) ?? normalizeEspnPlayer(entry, league, recordValue(entry, "playerId"));
  if (!player) {
    return undefined;
  }
  const lineupSlotId = numberFromUnknown(recordValue(entry, "lineupSlotId"));
  const slot =
    (lineupSlotId === undefined
      ? undefined
      : decodeEspnLineupSlotId(lineupSlotId)) ?? "unknown";
  const poolApplied = isRecord(playerPoolEntry)
    ? numberFromUnknown(recordValue(playerPoolEntry, "appliedStatTotal"))
    : undefined;
  const actualPoints =
    (isRecord(playerRecord)
      ? statAppliedTotal(playerRecord, scoringPeriod, 0)
      : undefined) ??
    poolApplied ??
    numberFromUnknown(recordValue(entry, "appliedStatTotal"));
  const projectedPoints = isRecord(playerRecord)
    ? statAppliedTotal(playerRecord, scoringPeriod, 1)
    : undefined;

  return {
    actualPoints,
    projectedPoints,
    player,
    playerRef: {
      provider: ESPN_PROVIDER_ID,
      providerId: player.providerId,
    },
    slot,
    status:
      stringFromUnknown(recordValue(entry, "status")) ??
      stringFromUnknown(recordValue(entry, "injuryStatus")) ??
      "unknown",
    points: actualPoints,
    started: espnLineupSlotIsStarted(lineupSlotId),
    metadata: {
      ...(lineupSlotId === undefined ? {} : { lineupSlotId }),
      ...(lineupSlotId === undefined
        ? {}
        : { lineupSlotLabel: decodeEspnLineupSlotId(lineupSlotId) ?? null }),
      injuryStatus: recordValue(entry, "injuryStatus") ?? null,
    },
  };
}

function rosterRecordFromSide(
  side: unknown,
): Record<string, unknown> | undefined {
  const current = recordValue(side, "rosterForCurrentScoringPeriod");
  if (isRecord(current)) {
    return current;
  }
  const matchup = recordValue(side, "rosterForMatchupPeriod");
  if (isRecord(matchup)) {
    return matchup;
  }
  const delayed = recordValue(side, "rosterForMatchupPeriodDelayed");
  return isRecord(delayed) ? delayed : undefined;
}

function normalizeRostersFromSchedule(
  league: EspnLeagueApiResponse,
  ref: ProviderLeagueRef,
  scoringPeriod: number,
): NormalizedRoster[] {
  const rosters = new Map<string, NormalizedRoster>();
  for (const matchup of league.schedule ?? []) {
    for (const sideKey of ["home", "away"] as const) {
      const side = recordValue(matchup, sideKey);
      const teamId = positiveProviderId(recordValue(side, "teamId"));
      const rosterRecord = rosterRecordFromSide(side);
      if (!teamId || !rosterRecord) {
        continue;
      }
      const entries = recordArray(rosterRecord, "entries")
        .map((entry) => normalizeRosterEntry(entry, ref, scoringPeriod))
        .filter((entry): entry is NormalizedRoster["entries"][number] =>
          Boolean(entry),
        );
      rosters.set(`${teamId}:${scoringPeriod}`, {
        teamRef: {
          provider: ESPN_PROVIDER_ID,
          providerId: teamId,
          season: ref.season,
        },
        season: ref.season,
        scoringPeriod,
        entries,
      });
    }
  }
  return [...rosters.values()].sort((left, right) =>
    left.teamRef.providerId.localeCompare(right.teamRef.providerId, undefined, {
      numeric: true,
    }),
  );
}

function withoutRosterEntryScores(
  entry: NormalizedRoster["entries"][number],
): NormalizedRoster["entries"][number] {
  return {
    ...entry,
    actualPoints: undefined,
    points: undefined,
    projectedPoints: undefined,
  };
}

function normalizeRostersFromTeams(
  league: EspnLeagueApiResponse,
  ref: ProviderLeagueRef,
  scoringPeriod: number,
): NormalizedRoster[] {
  return (league.teams ?? [])
    .map((team) => {
      const teamRecord = team as Record<string, unknown>;
      const rosterRecord = recordValue(teamRecord, "roster");
      const teamId = positiveProviderId(team.id);
      if (!teamId || !isRecord(rosterRecord)) {
        return undefined;
      }
      return {
        teamRef: {
          provider: ESPN_PROVIDER_ID,
          providerId: teamId,
          season: ref.season,
        },
        season: ref.season,
        scoringPeriod,
        entries: recordArray(rosterRecord, "entries")
          .map((entry) => normalizeRosterEntry(entry, ref, scoringPeriod))
          .map((entry) =>
            entry === undefined ? undefined : withoutRosterEntryScores(entry),
          )
          .filter((entry): entry is NormalizedRoster["entries"][number] =>
            Boolean(entry),
          ),
      };
    })
    .filter((roster): roster is NormalizedRoster => Boolean(roster));
}

function rosterLineupLooksSparse(
  rosters: readonly NormalizedRoster[],
): boolean {
  const entries = rosters.flatMap((roster) => roster.entries);
  if (entries.length === 0) {
    return false;
  }
  const slots = new Set(entries.map((entry) => entry.slot));
  return (
    slots.size <= 1 &&
    [...slots].every((slot) => slot === "QB" || slot === "unknown")
  );
}

function canUseScoredRosterFallback(code: string): boolean {
  switch (code) {
    case "PROVIDER_PARSE_ERROR":
    case "PROVIDER_NOT_FOUND":
      return true;
    default:
      return false;
  }
}

function shouldRetryTransactionsUnfiltered(code: string): boolean {
  switch (code) {
    case "PROVIDER_PARSE_ERROR":
      return true;
    default:
      return false;
  }
}

function mergeRosterLineupDetails({
  lineupRosters,
  scoredRosters,
}: {
  lineupRosters: readonly NormalizedRoster[];
  scoredRosters: readonly NormalizedRoster[];
}): NormalizedRoster[] {
  const byKey = new Map<string, NormalizedRoster>();
  for (const roster of scoredRosters) {
    byKey.set(
      `${roster.teamRef.providerId}:${roster.season}:${roster.scoringPeriod}`,
      roster,
    );
  }

  for (const lineupRoster of lineupRosters) {
    const key = `${lineupRoster.teamRef.providerId}:${lineupRoster.season}:${lineupRoster.scoringPeriod}`;
    const scoredRoster = byKey.get(key);
    if (!scoredRoster) {
      byKey.set(key, lineupRoster);
      continue;
    }

    const entriesByPlayer = new Map(
      lineupRoster.entries.map((entry) => [entry.playerRef.providerId, entry]),
    );
    const mergedEntries = new Map<
      string,
      NormalizedRoster["entries"][number]
    >();
    for (const lineupEntry of lineupRoster.entries) {
      mergedEntries.set(lineupEntry.playerRef.providerId, lineupEntry);
    }
    for (const scoredEntry of scoredRoster.entries) {
      const lineupEntry = entriesByPlayer.get(scoredEntry.playerRef.providerId);
      mergedEntries.set(scoredEntry.playerRef.providerId, {
        ...(lineupEntry ?? scoredEntry),
        actualPoints: scoredEntry.actualPoints ?? lineupEntry?.actualPoints,
        isKeeper: scoredEntry.isKeeper ?? lineupEntry?.isKeeper,
        metadata: {
          ...(lineupEntry?.metadata ?? {}),
          ...(scoredEntry.metadata ?? {}),
        },
        player: scoredEntry.player ?? lineupEntry?.player,
        playerRef: scoredEntry.playerRef,
        points: scoredEntry.points ?? lineupEntry?.points,
        projectedPoints:
          scoredEntry.projectedPoints ?? lineupEntry?.projectedPoints,
        status: scoredEntry.status ?? lineupEntry?.status ?? "unknown",
      });
    }
    byKey.set(key, {
      ...scoredRoster,
      entries: [...mergedEntries.values()].sort((left, right) => {
        if (left.started !== right.started) {
          return left.started ? -1 : 1;
        }
        return (
          left.slot.localeCompare(right.slot) ||
          left.playerRef.providerId.localeCompare(
            right.playerRef.providerId,
            undefined,
            { numeric: true },
          )
        );
      }),
    });
  }

  return [...byKey.values()].sort(
    (left, right) =>
      left.season - right.season ||
      left.scoringPeriod - right.scoringPeriod ||
      left.teamRef.providerId.localeCompare(
        right.teamRef.providerId,
        undefined,
        {
          numeric: true,
        },
      ),
  );
}

function normalizeDraftPicks(
  league: EspnLeagueApiResponse,
  ref: ProviderLeagueRef,
): NormalizedDraftPick[] {
  const playerById = playerMapFromLeague(league, ref);
  const draftDetail = recordValue(league, "draftDetail");
  const picks: NormalizedDraftPick[] = [];

  for (const pick of recordArray(draftDetail, "picks")) {
    const round = numberFromUnknown(recordValue(pick, "roundId"));
    const teamId = positiveProviderId(recordValue(pick, "teamId"));
    const pickId =
      positiveProviderId(recordValue(pick, "id")) ??
      [
        round,
        numberFromUnknown(recordValue(pick, "roundPickNumber")),
        numberFromUnknown(recordValue(pick, "overallPickNumber")),
        teamId,
      ]
        .filter((part) => part !== undefined)
        .join(":");
    if (!round || !teamId || !pickId) {
      continue;
    }
    const providerPlayerId = positiveProviderId(recordValue(pick, "playerId"));
    const player =
      providerPlayerId === undefined
        ? undefined
        : playerById.get(providerPlayerId);
    const isKeeper =
      booleanFromUnknown(recordValue(pick, "keeper")) ??
      booleanFromUnknown(recordValue(pick, "reservedForKeeper"));
    const auctionValue = numberFromUnknown(recordValue(pick, "bidAmount"));
    const lineupSlotId = numberFromUnknown(recordValue(pick, "lineupSlotId"));
    picks.push({
      provider: ESPN_PROVIDER_ID,
      providerId: pickId,
      leagueProviderId: ref.providerId,
      season: ref.season,
      round,
      ...(numberFromUnknown(recordValue(pick, "overallPickNumber")) ===
      undefined
        ? {}
        : {
            pickOverall: numberFromUnknown(
              recordValue(pick, "overallPickNumber"),
            ),
          }),
      ...(numberFromUnknown(recordValue(pick, "roundPickNumber")) === undefined
        ? {}
        : {
            pickInRound: numberFromUnknown(
              recordValue(pick, "roundPickNumber"),
            ),
          }),
      teamRef: {
        provider: ESPN_PROVIDER_ID,
        providerId: teamId,
        season: ref.season,
      },
      ...(providerPlayerId
        ? {
            playerRef: {
              provider: ESPN_PROVIDER_ID,
              providerId: providerPlayerId,
            },
          }
        : {}),
      ...(player ? { player } : {}),
      ...(isKeeper === undefined ? {} : { isKeeper }),
      ...(auctionValue === undefined ? {} : { auctionValue }),
      metadata: {
        lineupSlotId: recordValue(pick, "lineupSlotId") ?? null,
        lineupSlotLabel:
          lineupSlotId === undefined
            ? null
            : (decodeEspnLineupSlotId(lineupSlotId) ?? null),
        nominatingTeamId: recordValue(pick, "nominatingTeamId") ?? null,
        owningTeamIds: recordValue(pick, "owningTeamIds") ?? [],
      },
    });
  }

  return picks;
}

function normalizeTransactions(
  league: EspnLeagueApiResponse,
  ref: ProviderLeagueRef,
): NormalizedTransaction[] {
  const transactions: NormalizedTransaction[] = [];

  for (const transaction of recordArray(league, "transactions")) {
    const transactionId =
      positiveProviderId(recordValue(transaction, "id")) ??
      stringFromUnknown(recordValue(transaction, "transactionId"));
    const rawTypeValue = recordValue(transaction, "type");
    const typeValue = stringFromUnknown(rawTypeValue);
    const processDate =
      numberFromUnknown(recordValue(transaction, "processDate")) ??
      numberFromUnknown(recordValue(transaction, "proposedDate")) ??
      numberFromUnknown(recordValue(transaction, "date"));
    const items = recordArray(transaction, "items");
    const playerRefs: NormalizedTransaction["playerRefs"] = items
      .map((item) => positiveProviderId(recordValue(item, "playerId")))
      .filter((id): id is string => Boolean(id))
      .map((providerId) => ({ provider: ESPN_PROVIDER_ID, providerId }));
    const teamIds = [
      positiveProviderId(recordValue(transaction, "teamId")),
      ...items.flatMap((item) => [
        positiveProviderId(recordValue(item, "teamId")),
        positiveProviderId(recordValue(item, "fromTeamId")),
        positiveProviderId(recordValue(item, "toTeamId")),
      ]),
    ].filter((id): id is string => Boolean(id));
    if (playerRefs.length === 0 && teamIds.length === 0) {
      continue;
    }
    const teamRefs: NormalizedTransaction["teamRefs"] = [
      ...new Set(teamIds),
    ].map((providerId) => ({
      provider: ESPN_PROVIDER_ID,
      providerId,
      season: ref.season,
    }));
    const decodedActivity =
      decodeEspnActivityValue(rawTypeValue) ??
      items
        .map((item) => decodeEspnActivityValue(recordValue(item, "type")))
        .find(Boolean);
    const normalizedType = normalizeTransactionType(rawTypeValue, items);
    const fallbackId = [
      normalizedType,
      processDate ?? "unknown-date",
      ...teamIds,
      ...playerRefs.map((player) => player.providerId),
    ].join(":");
    const scoringPeriod = numberFromUnknown(
      recordValue(transaction, "scoringPeriodId"),
    );
    transactions.push({
      provider: ESPN_PROVIDER_ID,
      providerId: transactionId ?? fallbackId,
      leagueProviderId: ref.providerId,
      season: ref.season,
      type: normalizedType,
      teamRefs,
      playerRefs: [
        ...new Map(
          playerRefs.map((player) => [player.providerId, player]),
        ).values(),
      ],
      ...(scoringPeriod === undefined ? {} : { scoringPeriod }),
      timestamp:
        processDate === undefined
          ? new Date(Date.UTC(ref.season, 0, 1))
          : new Date(processDate),
      details: {
        bidAmount: recordValue(transaction, "bidAmount") ?? null,
        status: recordValue(transaction, "status") ?? null,
        rawType: typeValue ?? null,
        rawActivityTypeId:
          numberFromUnknown(rawTypeValue) ??
          items
            .map((item) => numberFromUnknown(recordValue(item, "type")))
            .find((id) => id !== undefined) ??
          null,
        activityCategory: decodedActivity?.category ?? null,
        activityLabel: decodedActivity?.label ?? null,
        items: items.map((item) => ({
          type: recordValue(item, "type") ?? null,
          activityCategory:
            decodeEspnActivityValue(recordValue(item, "type"))?.category ??
            null,
          activityLabel:
            decodeEspnActivityValue(recordValue(item, "type"))?.label ?? null,
          playerId: recordValue(item, "playerId") ?? null,
          fromTeamId: recordValue(item, "fromTeamId") ?? null,
          toTeamId: recordValue(item, "toTeamId") ?? null,
        })),
      },
    });
  }

  return transactions;
}

function normalizeTransactionType(
  typeValue: unknown,
  items: readonly Record<string, unknown>[],
): NormalizedTransaction["type"] {
  const decoded =
    decodeEspnActivityValue(typeValue) ??
    items
      .map((item) => decodeEspnActivityValue(recordValue(item, "type")))
      .find(Boolean);
  if (decoded) {
    return decoded.category;
  }

  const value = stringFromUnknown(typeValue)?.toUpperCase();
  if (value?.includes("TRADE")) {
    return "trade";
  }
  if (value?.includes("WAIVER")) {
    return "waiver";
  }
  if (value?.includes("ADD") || value?.includes("FREEAGENT")) {
    return "add";
  }
  if (value?.includes("DROP")) {
    return "drop";
  }
  const itemTypes = items
    .map((item) => stringFromUnknown(recordValue(item, "type"))?.toUpperCase())
    .filter(Boolean);
  if (itemTypes.includes("TRADED")) {
    return "trade";
  }
  if (itemTypes.includes("ADDED")) {
    return "add";
  }
  if (itemTypes.includes("DROPPED")) {
    return "drop";
  }
  return "unknown";
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
  const matchups = normalizeScheduleMatchups(
    league.schedule ?? [],
    seasonRef,
    league,
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

function scoringPeriodsForLeague(league: NormalizedLeague): number[] {
  const finalPeriod =
    league.postseason?.championshipScoringPeriod ??
    league.postseason?.regularSeasonEndScoringPeriod ??
    league.currentScoringPeriod;
  if (!Number.isInteger(finalPeriod) || finalPeriod <= 0) {
    return [];
  }
  return Array.from({ length: finalPeriod }, (_, index) => index + 1);
}

function matchupPeriodForScoringPeriod(
  league: EspnLeagueApiResponse,
  scoringPeriod: number,
): number {
  const settings = recordValue(league, "settings");
  const scheduleSettings = recordValue(settings, "scheduleSettings");
  const matchupPeriods = recordValue(scheduleSettings, "matchupPeriods");
  if (!isRecord(matchupPeriods)) {
    return scoringPeriod;
  }

  for (const [matchupPeriod, scoringPeriods] of Object.entries(
    matchupPeriods,
  )) {
    if (
      Array.isArray(scoringPeriods) &&
      scoringPeriods
        .map(numberFromUnknown)
        .some((period) => period === scoringPeriod)
    ) {
      return numberFromUnknown(matchupPeriod) ?? scoringPeriod;
    }
  }

  return scoringPeriod;
}

function mergeRosterLists(
  left: readonly NormalizedRoster[],
  right: readonly NormalizedRoster[],
): NormalizedRoster[] {
  const byKey = new Map<string, NormalizedRoster>();
  for (const roster of [...left, ...right]) {
    byKey.set(
      `${roster.teamRef.providerId}:${roster.season}:${roster.scoringPeriod}`,
      roster,
    );
  }
  return [...byKey.values()].sort(
    (leftRoster, rightRoster) =>
      leftRoster.season - rightRoster.season ||
      leftRoster.scoringPeriod - rightRoster.scoringPeriod ||
      leftRoster.teamRef.providerId.localeCompare(
        rightRoster.teamRef.providerId,
        undefined,
        { numeric: true },
      ),
  );
}

function playersFromRosters(
  rosters: readonly NormalizedRoster[],
): NormalizedPlayer[] {
  const byProviderId = new Map<string, NormalizedPlayer>();
  for (const roster of rosters) {
    for (const entry of roster.entries) {
      if (entry.player) {
        byProviderId.set(entry.player.providerId, entry.player);
      }
    }
  }
  return [...byProviderId.values()].sort((left, right) =>
    left.providerId.localeCompare(right.providerId, undefined, {
      numeric: true,
    }),
  );
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
      views: ["mMatchup", "mMatchupScore", "mSettings"],
    });
    if (!league.ok) {
      return league;
    }

    const matchups = normalizeScheduleMatchups(
      league.value.schedule ?? [],
      ref,
      league.value,
      scoringPeriod,
    );

    return ok(matchups);
  }

  async getRosters(
    session: EspnSession,
    ref: ProviderLeagueRef,
    scoringPeriod?: number,
  ): Promise<ProviderResult<NormalizedRoster[]>> {
    const requestedScoringPeriod = scoringPeriod ?? 1;
    const boxscore = await this.fetchCurrentLeagueApi({
      extraHeaders: scheduleFilterHeader(requestedScoringPeriod),
      ref,
      resource: "league-rosters",
      scoringPeriod: requestedScoringPeriod,
      session,
      views: ["mBoxscore", "mMatchupScore", "mScoreboard", "kona_player_info"],
    });
    if (!boxscore.ok) {
      return boxscore;
    }

    const boxscoreRosters = normalizeRostersFromSchedule(
      boxscore.value,
      ref,
      requestedScoringPeriod,
    );
    if (boxscoreRosters.some((roster) => roster.entries.length > 0)) {
      if (!rosterLineupLooksSparse(boxscoreRosters)) {
        return ok(boxscoreRosters);
      }
      const lineupRoster = await this.fetchCurrentLeagueApi({
        ref,
        resource: "league-rosters",
        scoringPeriod: requestedScoringPeriod,
        session,
        views: ["mRoster", "kona_player_info"],
      });
      if (lineupRoster.ok) {
        return ok(
          mergeRosterLineupDetails({
            lineupRosters: normalizeRostersFromTeams(
              lineupRoster.value,
              ref,
              requestedScoringPeriod,
            ),
            scoredRosters: boxscoreRosters,
          }),
        );
      }
      if (!canUseScoredRosterFallback(lineupRoster.error.code)) {
        return lineupRoster;
      }
      return ok(boxscoreRosters);
    }

    const roster = await this.fetchCurrentLeagueApi({
      ref,
      resource: "league-rosters",
      scoringPeriod: requestedScoringPeriod,
      session,
      views: ["mRoster", "kona_player_info"],
    });
    if (!roster.ok) {
      return roster;
    }
    return ok(
      normalizeRostersFromTeams(roster.value, ref, requestedScoringPeriod),
    );
  }

  async getDraftPicks(
    session: EspnSession,
    ref: ProviderLeagueRef,
  ): Promise<ProviderResult<NormalizedDraftPick[]>> {
    const league = await this.fetchCurrentLeagueApi({
      ref,
      resource: "league-draft",
      session,
      views: ["mDraftDetail", "kona_player_info"],
    });
    if (!league.ok) {
      return league;
    }
    return ok(normalizeDraftPicks(league.value, ref));
  }

  async getTransactions(
    session: EspnSession,
    ref: ProviderLeagueRef,
    scoringPeriod?: number,
  ): Promise<ProviderResult<NormalizedTransaction[]>> {
    let league = await this.fetchCurrentLeagueApi({
      extraHeaders: transactionFilterHeader(),
      ref,
      resource: "league-transactions",
      scoringPeriod,
      session,
      views: ["mTransactions2"],
    });
    if (!league.ok && shouldRetryTransactionsUnfiltered(league.error.code)) {
      league = await this.fetchCurrentLeagueApi({
        ref,
        resource: "league-transactions",
        scoringPeriod,
        session,
        views: ["mTransactions2"],
      });
    }
    if (!league.ok) {
      return league;
    }
    return ok(normalizeTransactions(league.value, ref));
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
        const bundle = normalizeHistoryBundle(league, ref);
        const seasonRef = {
          ...ref,
          name: bundle.league.name,
          season: bundle.league.season,
          size: bundle.league.size,
        };
        let rosters: NormalizedRoster[] = [];
        for (const scoringPeriod of scoringPeriodsForLeague(bundle.league)) {
          const matchupPeriod = matchupPeriodForScoringPeriod(
            league,
            scoringPeriod,
          );
          const boxscore = await this.fetchHistoricalLeagueApi({
            extraHeaders: scheduleFilterHeader(matchupPeriod),
            ref: seasonRef,
            resource: "league-history-rosters",
            scoringPeriod,
            season: bundle.league.season,
            session,
            views: [
              "mBoxscore",
              "mMatchupScore",
              "mScoreboard",
              "kona_player_info",
            ],
          });
          if (!boxscore.ok) {
            return err(boxscore.error);
          }
          const [historyLeague] = boxscore.value;
          if (historyLeague) {
            let periodRosters = normalizeRostersFromSchedule(
              historyLeague,
              seasonRef,
              scoringPeriod,
            );
            if (rosterLineupLooksSparse(periodRosters)) {
              const lineupRoster = await this.fetchHistoricalLeagueApi({
                ref: seasonRef,
                resource: "league-history-roster-lineup",
                scoringPeriod,
                season: bundle.league.season,
                session,
                views: ["mRoster", "kona_player_info"],
              });
              if (lineupRoster.ok && lineupRoster.value[0]) {
                periodRosters = mergeRosterLineupDetails({
                  lineupRosters: normalizeRostersFromTeams(
                    lineupRoster.value[0],
                    seasonRef,
                    scoringPeriod,
                  ),
                  scoredRosters: periodRosters,
                });
              } else if (
                !lineupRoster.ok &&
                !canUseScoredRosterFallback(lineupRoster.error.code)
              ) {
                return err(lineupRoster.error);
              }
            }
            rosters = mergeRosterLists(rosters, periodRosters);
          }
        }

        const draft = await this.fetchHistoricalLeagueApi({
          ref: seasonRef,
          resource: "league-history-draft",
          season: bundle.league.season,
          session,
          views: ["mDraftDetail", "kona_player_info"],
        });
        if (!draft.ok) {
          return err(draft.error);
        }
        const draftLeague = draft.value[0];
        const draftPicks = draftLeague
          ? normalizeDraftPicks(draftLeague, seasonRef)
          : [];

        let transactions = await this.fetchHistoricalLeagueApi({
          extraHeaders: transactionFilterHeader(),
          ref: seasonRef,
          resource: "league-history-transactions",
          season: bundle.league.season,
          session,
          views: ["mTransactions2"],
        });
        if (
          !transactions.ok &&
          shouldRetryTransactionsUnfiltered(transactions.error.code)
        ) {
          transactions = await this.fetchHistoricalLeagueApi({
            ref: seasonRef,
            resource: "league-history-transactions",
            season: bundle.league.season,
            session,
            views: ["mTransactions2"],
          });
        }
        if (!transactions.ok) {
          if (!canUseScoredRosterFallback(transactions.error.code)) {
            return err(transactions.error);
          }
        }
        const transactionLeague = transactions.ok
          ? transactions.value[0]
          : undefined;
        const transactionRows = transactionLeague
          ? normalizeTransactions(transactionLeague, seasonRef)
          : [];

        bundles.push({
          ...bundle,
          draftPicks,
          players: playersFromRosters(rosters),
          rosters,
          transactions: transactionRows,
        });
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
    extraHeaders,
    ref,
    resource,
    scoringPeriod,
    session,
    views,
  }: {
    extraHeaders?: Record<string, string>;
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
            headers: { ...espnHeaders(session), ...(extraHeaders ?? {}) },
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
    extraHeaders,
    ref,
    resource,
    scoringPeriod,
    season,
    session,
    views,
  }: {
    extraHeaders?: Record<string, string>;
    ref: ProviderLeagueRef;
    resource: string;
    scoringPeriod?: number;
    season: number;
    session: EspnSession;
    views: string[];
  }): Promise<ProviderResult<EspnLeagueHistoryApiResponse>> {
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        const response = await this.fetchImpl(
          historyLeagueApiUrl({ ref, scoringPeriod, season, views }),
          {
            cache: "no-store",
            headers: { ...espnHeaders(session), ...(extraHeaders ?? {}) },
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
