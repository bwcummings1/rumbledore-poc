import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

export type VcrMode = "record" | "replay";

export interface VcrCassette {
  interactions: VcrInteraction[];
  recordedAt: string;
  service: string;
}

export interface VcrFetchResponse {
  body: unknown;
  headers?: Record<string, string>;
  status: number;
  statusText?: string;
}

export interface VcrInteraction {
  request: unknown;
  response: unknown;
}

const SECRET_QUERY_PARAMS = new Set([
  "api_key",
  "apikey",
  "key",
  "token",
  "access_token",
]);

const SECRET_FIELD_NAMES = new Set([
  "api_key",
  "apikey",
  "apiKey",
  "authorization",
  "Authorization",
  "Ocp-Apim-Subscription-Key",
  "x-api-key",
]);

const SECRET_PATTERNS = [
  /\bsk-ant-[A-Za-z0-9_-]{20,}\b/,
  /\bsk-(?!ant-)(?:proj-)?[A-Za-z0-9_-]{20,}\b/,
  /\bBearer\s+(?!\[REDACTED\])[A-Za-z0-9._~-]{12,}\b/,
];

const UNSAFE_OBJECT_KEYS = new Set(["__proto__", "constructor", "prototype"]);
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeObjectKey(key: string): string {
  if (UNSAFE_OBJECT_KEYS.has(key)) {
    throw new Error(`Unsafe VCR object key: ${key}`);
  }
  return key;
}

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortObject);
  }

  if (!isPlainObject(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [safeObjectKey(key), sortObject(entry)]),
  );
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortObject(value));
}

function normalizeHeaderValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(() => "[REDACTED]");
  }
  if (typeof value !== "string") {
    return "[REDACTED]";
  }
  return value.startsWith("Bearer ") ? "Bearer [REDACTED]" : "[REDACTED]";
}

export function scrubVcrValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(scrubVcrValue);
  }

  if (typeof value === "string") {
    return value.replace(
      /\bBearer\s+[A-Za-z0-9._~-]{12,}\b/g,
      "Bearer [REDACTED]",
    );
  }

  if (!isPlainObject(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => {
      const safeKey = safeObjectKey(key);
      if (SECRET_FIELD_NAMES.has(key)) {
        return [safeKey, normalizeHeaderValue(entry)];
      }
      return [safeKey, scrubVcrValue(entry)];
    }),
  );
}

export function hashVcrValue(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

export function normalizeVcrUrl(rawUrl: string): {
  origin: string;
  pathname: string;
  query: [string, string][];
} {
  const url = new URL(rawUrl);
  return {
    origin: url.origin,
    pathname: url.pathname,
    query: normalizeQueryString(url.search.slice(1)),
  };
}

function decodeQueryPart(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return value;
  }
}

function normalizeQueryString(queryString: string): [string, string][] {
  if (!queryString) {
    return [];
  }

  return queryString
    .split("&")
    .filter(Boolean)
    .map((part): [string, string] => {
      const separatorIndex = part.indexOf("=");
      const rawKey =
        separatorIndex === -1 ? part : part.slice(0, separatorIndex);
      const rawValue =
        separatorIndex === -1 ? "" : part.slice(separatorIndex + 1);
      const key = safeObjectKey(decodeQueryPart(rawKey));
      const value = decodeQueryPart(rawValue);
      return [
        key,
        SECRET_QUERY_PARAMS.has(key.toLowerCase()) ? "[REDACTED]" : value,
      ];
    })
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => {
      const keyComparison = leftKey.localeCompare(rightKey);
      return keyComparison === 0
        ? leftValue.localeCompare(rightValue)
        : keyComparison;
    });
}

function parseJsonBody(body: BodyInit | null | undefined): unknown {
  if (body === null || body === undefined) {
    return undefined;
  }
  if (typeof body !== "string") {
    return String(body);
  }
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

function fetchRequestSignature(input: RequestInfo | URL, init?: RequestInit) {
  const url =
    typeof input === "string" || input instanceof URL
      ? String(input)
      : input.url;
  return scrubVcrValue({
    body: parseJsonBody(init?.body),
    method: init?.method ?? "GET",
    url: normalizeVcrUrl(url),
  });
}

function valuesEqual(left: unknown, right: unknown): boolean {
  return stableJson(left) === stableJson(right);
}

function isSubset(candidate: unknown, actual: unknown): boolean {
  if (valuesEqual(candidate, actual)) {
    return true;
  }

  if (Array.isArray(candidate) || Array.isArray(actual)) {
    return valuesEqual(candidate, actual);
  }

  if (!isPlainObject(candidate) || !isPlainObject(actual)) {
    return valuesEqual(candidate, actual);
  }

  return Object.entries(candidate).every(([key, value]) =>
    isSubset(value, actual[key]),
  );
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export function vcrMode(): VcrMode {
  return process.env.VCR_MODE === "record" ? "record" : "replay";
}

export async function readVcrCassette(cassetteUrl: URL): Promise<VcrCassette> {
  const raw = await readFile(cassetteUrl, "utf8");
  try {
    return JSON.parse(raw) as VcrCassette;
  } catch (cause) {
    throw new Error("Invalid VCR cassette JSON", { cause });
  }
}

export function assertCassetteSecretFree(
  cassette: VcrCassette,
  secrets: readonly (string | undefined)[] = [],
): void {
  const serialized = JSON.stringify(cassette);
  for (const secret of secrets) {
    if (secret && serialized.includes(secret)) {
      throw new Error("VCR cassette contains an explicit secret value");
    }
  }
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(serialized)) {
      throw new Error("VCR cassette contains a secret-looking token");
    }
  }
}

export async function writeScrubbedCassette(
  cassetteUrl: URL,
  cassette: VcrCassette,
): Promise<VcrCassette> {
  const scrubbed = scrubVcrValue(cassette) as VcrCassette;
  assertCassetteSecretFree(scrubbed);
  const filename = fileURLToPath(cassetteUrl);
  await mkdir(dirname(filename), { recursive: true });
  await writeFile(
    filename,
    `${JSON.stringify(sortObject(scrubbed), null, 2)}\n`,
  );
  return scrubbed;
}

export function createVcrReplayer(
  cassette: VcrCassette,
  options: {
    cassetteUrl?: URL;
    mode?: VcrMode;
  } = {},
) {
  const mode = options.mode ?? vcrMode();

  return {
    async replay<T>(request: unknown, record?: () => Promise<T>): Promise<T> {
      const normalizedRequest = scrubVcrValue(request);
      if (mode === "record") {
        if (!record) {
          throw new Error("VCR record mode requires a live recorder");
        }
        const response = await record();
        if (!options.cassetteUrl) {
          return response;
        }
        const interactions = cassette.interactions.filter(
          (interaction) => !isSubset(interaction.request, normalizedRequest),
        );
        interactions.push({
          request: normalizedRequest,
          response: scrubVcrValue(response),
        });
        await writeScrubbedCassette(options.cassetteUrl, {
          interactions,
          recordedAt: new Date().toISOString(),
          service: cassette.service,
        });
        return response;
      }

      const interaction = cassette.interactions.find((entry) =>
        isSubset(entry.request, normalizedRequest),
      );
      if (!interaction) {
        throw new Error(
          `No VCR interaction matched ${stableJson(normalizedRequest)}`,
        );
      }
      return clone(interaction.response as T);
    },
  };
}

export function createVcrFetch(
  cassette: VcrCassette,
  options: {
    cassetteUrl?: URL;
    fetcher?: typeof fetch;
    mode?: VcrMode;
  } = {},
): typeof fetch {
  const replayer = createVcrReplayer(cassette, options);
  const liveFetch = options.fetcher ?? fetch;

  return async (input, init) => {
    const request = fetchRequestSignature(input, init);
    const response = await replayer.replay<VcrFetchResponse>(
      request,
      async () => {
        const liveResponse = await liveFetch(input, init);
        const contentType = liveResponse.headers.get("content-type") ?? "";
        const body = contentType.includes("json")
          ? await liveResponse.clone().json()
          : await liveResponse.clone().text();
        return {
          body,
          headers: { "content-type": contentType || "application/json" },
          status: liveResponse.status,
          statusText: liveResponse.statusText,
        };
      },
    );

    return new Response(
      typeof response.body === "string"
        ? response.body
        : JSON.stringify(response.body),
      {
        status: response.status,
        statusText: response.statusText,
      },
    );
  };
}
