import net from "node:net";
import tls from "node:tls";

export type RedisValue = number | string | null;

const REDIS_TIMEOUT_MS = 1_500;

function redisCommand(parts: readonly string[]): string {
  return `*${parts.length}\r\n${parts
    .map((part) => {
      const value = String(part);
      return `$${Buffer.byteLength(value)}\r\n${value}\r\n`;
    })
    .join("")}`;
}

function parseRedisResponse(
  buffer: Buffer,
  offset: number,
): { nextOffset: number; value: RedisValue } | null {
  if (offset >= buffer.length) {
    return null;
  }

  const type = String.fromCharCode(buffer[offset]);
  const lineEnd = buffer.indexOf("\r\n", offset + 1);
  if (lineEnd === -1) {
    return null;
  }
  const line = buffer.toString("utf8", offset + 1, lineEnd);
  const nextLineOffset = lineEnd + 2;

  switch (type) {
    case "+":
      return { nextOffset: nextLineOffset, value: line };
    case "-":
      throw new Error(`Redis command failed: ${line}`);
    case ":":
      return { nextOffset: nextLineOffset, value: Number(line) };
    case "$": {
      const length = Number(line);
      if (length === -1) {
        return { nextOffset: nextLineOffset, value: null };
      }
      const valueEnd = nextLineOffset + length;
      const responseEnd = valueEnd + 2;
      if (buffer.length < responseEnd) {
        return null;
      }
      return {
        nextOffset: responseEnd,
        value: buffer.toString("utf8", nextLineOffset, valueEnd),
      };
    }
    default:
      throw new Error(`Unsupported Redis response type: ${type}`);
  }
}

function parseRedisResponses(buffer: Buffer): RedisValue[] | null {
  const values: RedisValue[] = [];
  let offset = 0;
  while (offset < buffer.length) {
    const parsed = parseRedisResponse(buffer, offset);
    if (!parsed) {
      return null;
    }
    values.push(parsed.value);
    offset = parsed.nextOffset;
  }
  return values;
}

function decodedUrlPart(value: string): string {
  return decodeURIComponent(value);
}

function redisPreludeCommands(url: URL): string[][] {
  const commands: string[][] = [];
  if (url.password || url.username) {
    commands.push(
      url.username
        ? ["AUTH", decodedUrlPart(url.username), decodedUrlPart(url.password)]
        : ["AUTH", decodedUrlPart(url.password)],
    );
  }

  const database = url.pathname.replace(/^\//, "");
  if (database) {
    commands.push(["SELECT", database]);
  }
  return commands;
}

export async function sendRedisCommand(
  rawUrl: string,
  command: readonly string[],
): Promise<RedisValue> {
  const url = new URL(rawUrl);
  if (url.protocol !== "redis:" && url.protocol !== "rediss:") {
    throw new Error(`Unsupported Redis URL protocol: ${url.protocol}`);
  }

  const commands = [...redisPreludeCommands(url), [...command]];
  const payload = commands.map(redisCommand).join("");
  const expectedResponses = commands.length;

  return new Promise<RedisValue>((resolve, reject) => {
    let settled = false;
    let received = Buffer.alloc(0);
    let socket: net.Socket | tls.TLSSocket;
    const finish = (error: Error | null, value?: RedisValue) => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      if (error) {
        reject(error);
      } else {
        resolve(value ?? null);
      }
    };
    socket =
      url.protocol === "rediss:"
        ? tls.connect({
            host: url.hostname,
            port: Number(url.port || 6379),
          })
        : net.createConnection({
            host: url.hostname,
            port: Number(url.port || 6379),
          });

    socket.setTimeout(REDIS_TIMEOUT_MS);
    socket.once("connect", () => {
      socket.write(payload);
    });
    socket.on("data", (chunk) => {
      received = Buffer.concat([received, chunk]);
      try {
        const responses = parseRedisResponses(received);
        if (responses && responses.length >= expectedResponses) {
          finish(null, responses[responses.length - 1] ?? null);
        }
      } catch (error) {
        finish(error as Error);
      }
    });
    socket.once("timeout", () => {
      finish(new Error("Redis command timed out"));
    });
    socket.once("error", finish);
    socket.once("close", () => {
      finish(new Error("Redis connection closed before response"));
    });
  });
}
