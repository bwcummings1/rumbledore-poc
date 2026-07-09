export const REDACTED = "[REDACTED]";

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFields = Record<string, unknown>;
export type LogSink = (line: string) => void;

export interface LoggerOptions {
  extraSecrets?: string[];
  now?: () => Date;
  sink?: LogSink | Partial<Record<LogLevel, LogSink>>;
}

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
}

const SENSITIVE_KEY =
  /(^|_|-)(authorization|cookie|credential|espn_s2|password|secret|swid|token|api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token)($|_|-)/i;
const FULL_BODY_KEY = /^(body|headers|rawBody|requestBody|request|response)$/i;
const WEBHOOK_URL_KEY =
  /(^webhookUrl$|(^|[_-])webhook[_-]?url$|^encryptedUrl$|^encrypted[_-]?url$)/i;

const defaultSinks: Record<LogLevel, LogSink> = {
  debug: (line) => console.debug(line),
  error: (line) => console.error(line),
  info: (line) => console.info(line),
  warn: (line) => console.warn(line),
};

function sinkFor(sink: LoggerOptions["sink"], level: LogLevel): LogSink {
  if (typeof sink === "function") {
    return sink;
  }
  return sink?.[level] ?? defaultSinks[level];
}

function redactString(value: string, extraSecrets: string[]): string {
  let redacted = value;

  for (const secret of extraSecrets) {
    if (secret.trim() === "") {
      continue;
    }
    redacted = redacted.split(secret).join(REDACTED);
  }

  return redacted
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, `$1 ${REDACTED}`)
    .replace(
      /\b(espn_s2|swid|token|secret|password|api[_-]?key)=([^;\s&]+)/gi,
      `$1=${REDACTED}`,
    );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}

function errorFields(
  error: Error,
  extraSecrets: string[],
  seen: WeakSet<object>,
): LogFields {
  const fields: LogFields = {
    message: redactString(error.message, extraSecrets),
    name: error.name,
  };

  const maybeStructured = error as Error & {
    cause?: unknown;
    code?: unknown;
    status?: unknown;
  };
  if (typeof maybeStructured.code === "string") {
    fields.code = maybeStructured.code;
  }
  if (typeof maybeStructured.status === "number") {
    fields.status = maybeStructured.status;
  }
  if (maybeStructured.cause !== undefined) {
    fields.cause = redactSecrets(maybeStructured.cause, {
      extraSecrets,
      seen,
    });
  }

  return fields;
}

export function redactSecrets(
  value: unknown,
  options: {
    extraSecrets?: string[];
    key?: string;
    seen?: WeakSet<object>;
  } = {},
): unknown {
  const extraSecrets = options.extraSecrets ?? [];
  const key = options.key ?? "";

  if (
    key !== "" &&
    (SENSITIVE_KEY.test(key) ||
      FULL_BODY_KEY.test(key) ||
      WEBHOOK_URL_KEY.test(key))
  ) {
    return REDACTED;
  }

  if (typeof value === "string") {
    return redactString(value, extraSecrets);
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }

  const seen = options.seen ?? new WeakSet<object>();
  if (seen.has(value)) {
    return "[Circular]";
  }
  seen.add(value);

  if (value instanceof Error) {
    return errorFields(value, extraSecrets, seen);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item, { extraSecrets, seen }));
  }

  if (!isPlainObject(value)) {
    return REDACTED;
  }

  const output: LogFields = {};
  for (const [fieldKey, fieldValue] of Object.entries(value)) {
    output[fieldKey] = redactSecrets(fieldValue, {
      extraSecrets,
      key: fieldKey,
      seen,
    });
  }
  return output;
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const now = options.now ?? (() => new Date());
  const extraSecrets = options.extraSecrets ?? [];

  const write = (level: LogLevel, message: string, fields: LogFields = {}) => {
    const safeFields = redactSecrets(fields, {
      extraSecrets,
    }) as LogFields;
    const entry = {
      ...safeFields,
      level,
      msg: redactString(message, extraSecrets),
      time: now().toISOString(),
    };
    sinkFor(options.sink, level)(JSON.stringify(entry));
  };

  return {
    debug: (message, fields) => write("debug", message, fields),
    error: (message, fields) => write("error", message, fields),
    info: (message, fields) => write("info", message, fields),
    warn: (message, fields) => write("warn", message, fields),
  };
}

export const logger = createLogger();
