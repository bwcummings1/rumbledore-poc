import { createHash } from "node:crypto";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

export const ESPN_CORPUS_VIEWS = [
  "mSettings",
  "mTeam",
  "mMatchupScore",
  "mBoxscore",
  "mRoster",
  "kona_player_info",
  "mDraftDetail",
  "mTransactions2",
] as const;

export type EspnCorpusView = (typeof ESPN_CORPUS_VIEWS)[number];

export const HARVESTER_VERSION = "1.0.0";

const ESPN_LEAGUE_API_ORIGIN = "https://lm-api-reads.fantasy.espn.com";
const DEFAULT_OUTPUT_DIRECTORY = "test/fixtures/espn-corpus";
const DEFAULT_REQUEST_BUDGET = 64;
const MAX_REQUEST_BUDGET = 256;
const DEFAULT_REQUESTS_PER_SECOND = 1;
const MAX_REQUESTS_PER_SECOND = 2;
const DEFAULT_JITTER_MS = 250;
const MAX_JITTER_MS = 2_000;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 25 * 1024 * 1024;
const MINIMUM_SALT_LENGTH = 16;
const GUID_PATTERN = /\{?[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\}?/gi;
const GUID_VALUE_PATTERN =
  /^\{?[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\}?$/i;
const EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const PRIVATE_FIELD_KEYS = new Set([
  "avatar",
  "avatarurl",
  "email",
  "emailaddress",
  "emailaddresses",
  "photo",
  "photourl",
  "picture",
  "pictureurl",
  "profileimage",
  "profileimageurl",
  "profilephoto",
  "profilephotourl",
]);
const ALIAS_ADJECTIVES = [
  "Amber",
  "Brisk",
  "Cobalt",
  "Daring",
  "Ember",
  "Fabled",
  "Golden",
  "Harbor",
  "Indigo",
  "Jovial",
  "Keen",
  "Lunar",
  "Merry",
  "Nimble",
  "Opal",
  "Plucky",
] as const;
const ALIAS_NOUNS = [
  "Badger",
  "Comet",
  "Dragon",
  "Falcon",
  "Griffin",
  "Heron",
  "Jackal",
  "Knight",
  "Lynx",
  "Meteor",
  "Otter",
  "Phoenix",
  "Raven",
  "Stag",
  "Tiger",
  "Wizard",
] as const;

type JsonObject = Record<string, unknown>;

export interface CorpusProvenance {
  leagueIdHash: string;
  season: number;
  view: EspnCorpusView;
  fetchedAt: string;
  contentHash: string;
  harvesterVersion: string;
}

export interface EspnCorpusEntry {
  provenance: CorpusProvenance;
  payload: unknown;
}

export interface HarvesterOptions {
  leagueId: string;
  seasons: number[];
  salt: string;
  outputDirectory: string;
  requestBudget: number;
  requestsPerSecond: number;
  jitterMs: number;
}

export interface HarvesterDependencies {
  fetch: typeof globalThis.fetch;
  now: () => number;
  random: () => number;
  sleep: (milliseconds: number) => Promise<void>;
  writeEntry: (path: string, entry: EspnCorpusEntry) => void;
}

export interface RequestGovernor {
  beforeRequest: () => Promise<void>;
  requestsUsed: () => number;
}

export class RequestBudgetExceededError extends Error {
  constructor(readonly requestBudget: number) {
    super(`ESPN corpus request budget of ${requestBudget} exhausted`);
    this.name = "RequestBudgetExceededError";
  }
}

function normalizedFieldKey(key: string): string {
  return key.replace(/[-_]/g, "").toLowerCase();
}

function digestHex(salt: string, purpose: string, value: string): string {
  return createHash("sha256")
    .update(salt)
    .update("\0")
    .update(purpose)
    .update("\0")
    .update(value)
    .digest("hex");
}

function canonicalMemberId(memberId: string): string {
  return memberId.replace(/^\{/, "").replace(/\}$/, "").toLowerCase();
}

export function hashLeagueId(leagueId: string, salt: string): string {
  return digestHex(salt, "league-id", leagueId).slice(0, 24);
}

function pseudonymizeMemberId(memberId: string, salt: string): string {
  return `member-${digestHex(salt, "member-id", canonicalMemberId(memberId)).slice(0, 20)}`;
}

function aliasForMember(
  identity: string,
  salt: string,
): {
  displayName: string;
  firstName: string;
  lastName: string;
} {
  const digest = digestHex(salt, "member-alias", canonicalMemberId(identity));
  const adjective =
    ALIAS_ADJECTIVES[
      Number.parseInt(digest.slice(0, 2), 16) % ALIAS_ADJECTIVES.length
    ];
  const noun =
    ALIAS_NOUNS[Number.parseInt(digest.slice(2, 4), 16) % ALIAS_NOUNS.length];
  const suffix = Number.parseInt(digest.slice(4, 8), 16) % 1_000;
  return {
    displayName: `${adjective} ${noun} ${suffix.toString().padStart(3, "0")}`,
    firstName: adjective,
    lastName: `${noun} ${suffix.toString().padStart(3, "0")}`,
  };
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectMemberIds(value: unknown, ids: Set<string>): void {
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectMemberIds(entry, ids);
    }
    return;
  }
  if (!isJsonObject(value)) {
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    if (normalizedFieldKey(key) === "members" && Array.isArray(child)) {
      for (const member of child) {
        if (!isJsonObject(member)) {
          continue;
        }
        const memberId = member.id;
        if (typeof memberId === "string" && memberId) {
          ids.add(canonicalMemberId(memberId));
        }
      }
    }
    collectMemberIds(child, ids);
  }
}

function replaceSensitiveString(
  value: string,
  salt: string,
  memberIds: ReadonlySet<string>,
): string {
  if (memberIds.has(canonicalMemberId(value))) {
    return pseudonymizeMemberId(value, salt);
  }

  return value
    .replace(GUID_PATTERN, (guid) => pseudonymizeMemberId(guid, salt))
    .replace(EMAIL_PATTERN, "[redacted-email]");
}

function memberIdentityForObject(
  value: JsonObject,
  memberIds: ReadonlySet<string>,
  memberRecord: boolean,
): string | undefined {
  const id = value.id;
  if (
    typeof id === "string" &&
    (memberRecord || memberIds.has(canonicalMemberId(id)))
  ) {
    return id;
  }
  if (typeof id === "string" && GUID_VALUE_PATTERN.test(id)) {
    return id;
  }
  if (memberRecord) {
    const nameParts = Object.entries(value)
      .filter(([key, child]) => {
        const normalizedKey = normalizedFieldKey(key);
        return (
          typeof child === "string" &&
          (normalizedKey === "displayname" ||
            normalizedKey === "firstname" ||
            normalizedKey === "lastname")
        );
      })
      .map(([, child]) => child as string);
    if (nameParts.length) {
      return `member-name:${nameParts.join("\0")}`;
    }
  }
  return undefined;
}

function leagueIdWithOriginalType(
  originalValue: unknown,
  leagueSurrogateId: number,
): number | string {
  const numericReplacementByType: Readonly<Record<string, number>> = {
    number: leagueSurrogateId,
  };
  return (
    numericReplacementByType[typeof originalValue] ?? String(leagueSurrogateId)
  );
}

function sanitizeValue(
  value: unknown,
  context: {
    leagueId: string;
    leagueSurrogateId: number;
    memberIds: ReadonlySet<string>;
    memberRecord: boolean;
    rootLeagueRecord: boolean;
    salt: string;
  },
): unknown {
  if (typeof value === "string") {
    return replaceSensitiveString(value, context.salt, context.memberIds);
  }
  if (Array.isArray(value)) {
    return value.map((entry) =>
      sanitizeValue(entry, {
        ...context,
        memberRecord: context.memberRecord,
        rootLeagueRecord: context.rootLeagueRecord,
      }),
    );
  }
  if (!isJsonObject(value)) {
    return value;
  }

  const memberIdentity = memberIdentityForObject(
    value,
    context.memberIds,
    context.memberRecord,
  );
  const alias = memberIdentity
    ? aliasForMember(memberIdentity, context.salt)
    : undefined;
  const sanitized: JsonObject = Object.create(null) as JsonObject;

  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = normalizedFieldKey(key);
    if (PRIVATE_FIELD_KEYS.has(normalizedKey)) {
      continue;
    }
    if (alias && normalizedKey === "displayname") {
      sanitized[key] = alias.displayName;
      continue;
    }
    if (alias && normalizedKey === "firstname") {
      sanitized[key] = alias.firstName;
      continue;
    }
    if (alias && normalizedKey === "lastname") {
      sanitized[key] = alias.lastName;
      continue;
    }
    if (
      context.rootLeagueRecord &&
      normalizedKey === "id" &&
      String(child) === context.leagueId
    ) {
      sanitized[key] = leagueIdWithOriginalType(
        child,
        context.leagueSurrogateId,
      );
      continue;
    }
    if (normalizedKey === "leagueid" && String(child) === context.leagueId) {
      sanitized[key] = leagueIdWithOriginalType(
        child,
        context.leagueSurrogateId,
      );
      continue;
    }

    const membersArray = normalizedKey === "members" && Array.isArray(child);
    if (membersArray) {
      sanitized[key] = child.map((member) =>
        sanitizeValue(member, {
          ...context,
          memberRecord: true,
          rootLeagueRecord: false,
        }),
      );
      continue;
    }
    sanitized[key] = sanitizeValue(child, {
      ...context,
      memberRecord: false,
      rootLeagueRecord: false,
    });
  }

  return sanitized;
}

export function sanitizeEspnPayload(
  payload: unknown,
  options: { leagueId: string; salt: string },
): unknown {
  if (options.salt.length < MINIMUM_SALT_LENGTH) {
    throw new Error(
      `Sanitizer salt must contain at least ${MINIMUM_SALT_LENGTH} characters`,
    );
  }

  const memberIds = new Set<string>();
  collectMemberIds(payload, memberIds);
  const leagueDigest = digestHex(
    options.salt,
    "league-surrogate",
    options.leagueId,
  );
  const leagueSurrogateId =
    (Number.parseInt(leagueDigest.slice(0, 8), 16) % 2_000_000_000) + 1;
  const baseContext = {
    leagueId: options.leagueId,
    leagueSurrogateId,
    memberIds,
    memberRecord: false,
    rootLeagueRecord: true,
    salt: options.salt,
  };

  if (Array.isArray(payload)) {
    return payload.map((league) => sanitizeValue(league, baseContext));
  }
  return sanitizeValue(payload, baseContext);
}

function canonicalJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalJsonValue);
  }
  if (!isJsonObject(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalJsonValue(value[key])]),
  );
}

export function corpusContentHash(payload: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalJsonValue(payload)))
    .digest("hex");
}

export function createRequestGovernor(options: {
  requestBudget: number;
  requestsPerSecond: number;
  jitterMs: number;
  now: () => number;
  random: () => number;
  sleep: (milliseconds: number) => Promise<void>;
}): RequestGovernor {
  if (
    !Number.isInteger(options.requestBudget) ||
    options.requestBudget < 1 ||
    options.requestBudget > MAX_REQUEST_BUDGET
  ) {
    throw new Error(
      `Request budget must be an integer from 1 through ${MAX_REQUEST_BUDGET}`,
    );
  }
  if (
    !Number.isFinite(options.requestsPerSecond) ||
    options.requestsPerSecond <= 0 ||
    options.requestsPerSecond > MAX_REQUESTS_PER_SECOND
  ) {
    throw new Error(
      `Requests per second must be greater than 0 and no more than ${MAX_REQUESTS_PER_SECOND}`,
    );
  }
  if (
    !Number.isInteger(options.jitterMs) ||
    options.jitterMs < 0 ||
    options.jitterMs > MAX_JITTER_MS
  ) {
    throw new Error(
      `Jitter must be an integer from 0 through ${MAX_JITTER_MS} milliseconds`,
    );
  }

  let requestsUsed = 0;
  let previousRequestStartedAt: number | undefined;
  const minimumIntervalMs = 1_000 / options.requestsPerSecond;

  return {
    beforeRequest: async () => {
      if (requestsUsed >= options.requestBudget) {
        throw new RequestBudgetExceededError(options.requestBudget);
      }

      if (previousRequestStartedAt !== undefined) {
        const untilRateWindow = Math.max(
          0,
          previousRequestStartedAt + minimumIntervalMs - options.now(),
        );
        const boundedRandom = Math.min(1, Math.max(0, options.random()));
        const jitter = Math.floor(boundedRandom * options.jitterMs);
        const delay = Math.ceil(untilRateWindow + jitter);
        if (delay > 0) {
          await options.sleep(delay);
        }
      }

      previousRequestStartedAt = options.now();
      requestsUsed += 1;
    },
    requestsUsed: () => requestsUsed,
  };
}

function historicalViewUrl(
  leagueId: string,
  season: number,
  view: EspnCorpusView,
): string {
  const url = new URL(
    `/apis/v3/games/ffl/leagueHistory/${encodeURIComponent(leagueId)}`,
    ESPN_LEAGUE_API_ORIGIN,
  );
  url.searchParams.set("seasonId", String(season));
  url.searchParams.set("view", view);
  return url.toString();
}

function defaultWriteEntry(path: string, entry: EspnCorpusEntry): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(entry, null, 2)}\n`, {
    encoding: "utf8",
    flag: "w",
  });
  renameSync(temporaryPath, path);
}

const defaultDependencies: HarvesterDependencies = {
  fetch: globalThis.fetch.bind(globalThis),
  now: Date.now,
  random: Math.random,
  sleep: (milliseconds) =>
    new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds)),
  writeEntry: defaultWriteEntry,
};

async function parseBoundedJsonResponse(
  response: Response,
  context: { season: number; view: EspnCorpusView },
): Promise<unknown> {
  if (!response.ok) {
    throw new Error(
      `ESPN ${context.view} request for season ${context.season} failed with HTTP ${response.status}`,
    );
  }

  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw new Error(
      `ESPN ${context.view} response for season ${context.season} exceeded ${MAX_RESPONSE_BYTES} bytes`,
    );
  }
  const body = await response.text();
  if (Buffer.byteLength(body, "utf8") > MAX_RESPONSE_BYTES) {
    throw new Error(
      `ESPN ${context.view} response for season ${context.season} exceeded ${MAX_RESPONSE_BYTES} bytes`,
    );
  }
  try {
    return JSON.parse(body) as unknown;
  } catch (cause) {
    throw new Error(
      `ESPN ${context.view} response for season ${context.season} was not valid JSON`,
      { cause },
    );
  }
}

export async function harvestPublicLeagues(
  options: HarvesterOptions,
  dependencies: Partial<HarvesterDependencies> = {},
): Promise<{
  entriesWritten: number;
  leagueIdHash: string;
  requestsUsed: number;
}> {
  const deps = { ...defaultDependencies, ...dependencies };
  if (!/^\d+$/.test(options.leagueId) || Number(options.leagueId) <= 0) {
    throw new Error("League id must be a positive ESPN numeric league id");
  }
  if (options.salt.length < MINIMUM_SALT_LENGTH) {
    throw new Error(
      `Sanitizer salt must contain at least ${MINIMUM_SALT_LENGTH} characters`,
    );
  }
  if (
    !options.seasons.length ||
    options.seasons.length > 32 ||
    options.seasons.some(
      (season) => !Number.isInteger(season) || season < 1900 || season > 2100,
    )
  ) {
    throw new Error(
      "Seasons must contain 1 through 32 years from 1900 through 2100",
    );
  }
  const plannedRequests = options.seasons.length * ESPN_CORPUS_VIEWS.length;
  if (plannedRequests > options.requestBudget) {
    throw new RequestBudgetExceededError(options.requestBudget);
  }

  const governor = createRequestGovernor({
    requestBudget: options.requestBudget,
    requestsPerSecond: options.requestsPerSecond,
    jitterMs: options.jitterMs,
    now: deps.now,
    random: deps.random,
    sleep: deps.sleep,
  });
  const leagueIdHash = hashLeagueId(options.leagueId, options.salt);
  let entriesWritten = 0;

  for (const season of options.seasons) {
    for (const view of ESPN_CORPUS_VIEWS) {
      await governor.beforeRequest();
      const response = await deps.fetch(
        historicalViewUrl(options.leagueId, season, view),
        {
          cache: "no-store",
          headers: {
            Accept: "application/json",
            "User-Agent": `Rumbledore-ESPN-Corpus-Harvester/${HARVESTER_VERSION}`,
            "x-fantasy-platform": "kona",
            "x-fantasy-source": "kona",
          },
          method: "GET",
          redirect: "error",
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        },
      );
      const rawPayload = await parseBoundedJsonResponse(response, {
        season,
        view,
      });
      const payload = sanitizeEspnPayload(rawPayload, {
        leagueId: options.leagueId,
        salt: options.salt,
      });
      const entry: EspnCorpusEntry = {
        provenance: {
          leagueIdHash,
          season,
          view,
          fetchedAt: new Date(deps.now()).toISOString(),
          contentHash: corpusContentHash(payload),
          harvesterVersion: HARVESTER_VERSION,
        },
        payload,
      };
      const path = join(
        options.outputDirectory,
        leagueIdHash,
        String(season),
        `${view}.json`,
      );
      deps.writeEntry(path, entry);
      entriesWritten += 1;
    }
  }

  return {
    entriesWritten,
    leagueIdHash,
    requestsUsed: governor.requestsUsed(),
  };
}

function optionValue(args: string[], index: number, option: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${option} requires a value`);
  }
  return value;
}

function positiveNumber(value: string, option: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${option} must be a positive number`);
  }
  return parsed;
}

export function parseHarvesterArgs(args: string[]): HarvesterOptions {
  let leagueId: string | undefined;
  let seasons: number[] | undefined;
  let salt: string | undefined;
  let outputDirectory = DEFAULT_OUTPUT_DIRECTORY;
  let requestBudget = DEFAULT_REQUEST_BUDGET;
  let requestsPerSecond = DEFAULT_REQUESTS_PER_SECOND;
  let jitterMs = DEFAULT_JITTER_MS;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    switch (argument) {
      case "--i-reviewed-tos":
        break;
      case "--league-id":
        leagueId = optionValue(args, index, argument);
        index += 1;
        break;
      case "--seasons": {
        const value = optionValue(args, index, argument);
        seasons = value.split(",").map((season) => Number(season.trim()));
        index += 1;
        break;
      }
      case "--salt":
        salt = optionValue(args, index, argument);
        index += 1;
        break;
      case "--output-dir":
        outputDirectory = optionValue(args, index, argument);
        index += 1;
        break;
      case "--request-budget":
        requestBudget = positiveNumber(
          optionValue(args, index, argument),
          argument,
        );
        index += 1;
        break;
      case "--rps":
        requestsPerSecond = positiveNumber(
          optionValue(args, index, argument),
          argument,
        );
        index += 1;
        break;
      case "--jitter-ms":
        jitterMs = Number(optionValue(args, index, argument));
        index += 1;
        break;
      default:
        throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if (!leagueId || !/^\d+$/.test(leagueId) || Number(leagueId) <= 0) {
    throw new Error("--league-id must be a positive ESPN numeric league id");
  }
  if (!seasons?.length || seasons.some((season) => !Number.isInteger(season))) {
    throw new Error(
      "--seasons must be a comma-separated list of integer years",
    );
  }
  const uniqueSeasons = [...new Set(seasons)].sort(
    (left, right) => left - right,
  );
  if (
    uniqueSeasons.length > 32 ||
    uniqueSeasons.some((season) => season < 1900 || season > 2100)
  ) {
    throw new Error(
      "--seasons must contain at most 32 years from 1900 through 2100",
    );
  }
  if (!salt || salt.length < MINIMUM_SALT_LENGTH) {
    throw new Error(
      `--salt must contain at least ${MINIMUM_SALT_LENGTH} characters`,
    );
  }
  if (!Number.isInteger(requestBudget) || requestBudget > MAX_REQUEST_BUDGET) {
    throw new Error(
      `--request-budget must be an integer no greater than ${MAX_REQUEST_BUDGET}`,
    );
  }
  if (requestsPerSecond > MAX_REQUESTS_PER_SECOND) {
    throw new Error(`--rps cannot exceed ${MAX_REQUESTS_PER_SECOND}`);
  }
  if (!Number.isInteger(jitterMs) || jitterMs < 0 || jitterMs > MAX_JITTER_MS) {
    throw new Error(
      `--jitter-ms must be an integer from 0 through ${MAX_JITTER_MS}`,
    );
  }

  return {
    leagueId,
    seasons: uniqueSeasons,
    salt,
    outputDirectory: resolve(outputDirectory),
    requestBudget,
    requestsPerSecond,
    jitterMs,
  };
}

export async function runHarvesterCli(
  args: string[],
  dependencies: Partial<HarvesterDependencies> & {
    error?: (message: string) => void;
    log?: (message: string) => void;
  } = {},
): Promise<number> {
  const error = dependencies.error ?? console.error;
  const log = dependencies.log ?? console.log;

  if (!args.includes("--i-reviewed-tos")) {
    error(
      [
        "REFUSING TO RUN: public ESPN harvesting is owner-gated.",
        "No network request was made. Complete the deliberate ESPN ToS review",
        "and obtain target-count approval before collecting any public league.",
        "Then re-run with --i-reviewed-tos plus --league-id, --seasons, and --salt.",
      ].join("\n"),
    );
    return 2;
  }

  try {
    const options = parseHarvesterArgs(args);
    const result = await harvestPublicLeagues(options, dependencies);
    log(
      `Wrote ${result.entriesWritten} sanitized ESPN corpus entries for league hash ${result.leagueIdHash} using ${result.requestsUsed} requests.`,
    );
    return 0;
  } catch (cause) {
    error(
      cause instanceof Error ? cause.message : "ESPN corpus harvest failed",
    );
    return 1;
  }
}

function invokedAsScript(): boolean {
  const executable = basename(process.argv[1] ?? "");
  return (
    executable === "harvest-public-leagues.ts" ||
    executable === "harvest-public-leagues.js"
  );
}

if (invokedAsScript()) {
  void runHarvesterCli(process.argv.slice(2)).then((exitCode) => {
    process.exitCode = exitCode;
  });
}
