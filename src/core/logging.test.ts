import { describe, expect, it } from "vitest";
import { createLogger, REDACTED, redactSecrets } from "./logging";

function parseLogLine(line: string): Record<string, unknown> {
  try {
    return JSON.parse(line) as Record<string, unknown>;
  } catch (cause) {
    throw new Error("Expected log line to be valid JSON", { cause });
  }
}

describe("structured logger", () => {
  it("emits JSON logs with stable core fields", () => {
    const lines: string[] = [];
    const logger = createLogger({
      now: () => new Date("2026-06-11T12:00:00.000Z"),
      sink: (line) => lines.push(line),
    });

    logger.info("health_check_ok", {
      leagueId: "0f0c4f2d-72ee-4966-bf44-9812168a1c8f",
      requestId: "req-1",
    });

    expect(lines).toHaveLength(1);
    expect(parseLogLine(lines[0])).toEqual({
      leagueId: "0f0c4f2d-72ee-4966-bf44-9812168a1c8f",
      level: "info",
      msg: "health_check_ok",
      requestId: "req-1",
      time: "2026-06-11T12:00:00.000Z",
    });
  });

  it("redacts sensitive fields, request bodies, auth headers, and configured secret values", () => {
    const lines: string[] = [];
    const privateValue = "fixture-private-value";
    const apiKeyField = "apiKey";
    const logger = createLogger({
      extraSecrets: [privateValue],
      sink: (line) => lines.push(line),
    });

    logger.warn(`saw ${privateValue}`, {
      [apiKeyField]: privateValue,
      authorization: `Bearer ${privateValue}`,
      body: { email: "manager@example.com" },
      nested: {
        ESPN_S2: privateValue,
        safe: "kept",
      },
      query: `token=${privateValue}`,
    });

    const serialized = lines[0];
    const entry = parseLogLine(serialized);
    const nested = entry.nested as Record<string, unknown>;

    expect(serialized).not.toContain(privateValue);
    expect(entry.msg).toBe(`saw ${REDACTED}`);
    expect(entry.apiKey).toBe(REDACTED);
    expect(entry.authorization).toBe(REDACTED);
    expect(entry.body).toBe(REDACTED);
    expect(nested.ESPN_S2).toBe(REDACTED);
    expect(nested.safe).toBe("kept");
    expect(entry.query).toBe(`token=${REDACTED}`);
  });

  it("serializes errors and circular objects without throwing", () => {
    const root: Record<string, unknown> = { name: "root" };
    root.self = root;
    const redacted = redactSecrets({
      error: new Error("password=abc123"),
      root,
    });

    expect(redacted).toMatchObject({
      error: { message: `password=${REDACTED}`, name: "Error" },
      root: { name: "root", self: "[Circular]" },
    });
  });
});
