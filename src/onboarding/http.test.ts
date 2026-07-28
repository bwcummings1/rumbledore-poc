import { describe, expect, it } from "vitest";
import { readJsonBody } from "./http";

/**
 * `readJsonBody` backs 39 API route handlers, so its contract is load-bearing.
 *
 * It previously returned `ok({})` for ANY parse failure, which turned a corrupt
 * payload into a successful empty request. On routes whose zod schema is
 * all-optional that empty object validated and the handler ran its default
 * branch — a destructive Data Book checkpoint restore executing on a body the
 * server could not read, and a body-less DELETE to the account push route
 * disabling every push subscription the user had in every league.
 *
 * It also capped size using `Content-Length` only, inside `if (contentLength)`,
 * so a chunked request that omits the header skipped the check entirely.
 */

function jsonRequest(body: string, headers: Record<string, string> = {}) {
  return new Request("https://example.test/api", {
    body,
    headers: { "content-type": "application/json", ...headers },
    method: "POST",
  });
}

describe("readJsonBody", () => {
  it("parses a valid body", async () => {
    const result = await readJsonBody(jsonRequest('{"reason":"cleanup"}'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({ reason: "cleanup" });
  });

  it("treats an ABSENT body as an empty object", async () => {
    // Several handlers legitimately take no payload and rely on all-optional
    // schemas, so this must keep working.
    const result = await readJsonBody(
      new Request("https://example.test/api", { method: "POST" }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({});
  });

  it("treats a whitespace-only body as an empty object", async () => {
    const result = await readJsonBody(jsonRequest("   \n  "));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({});
  });

  it("REJECTS a present-but-unparseable body instead of defaulting to {}", async () => {
    // The core regression: this must not become a successful empty request.
    const result = await readJsonBody(jsonRequest('{"reason": "unterminated'));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.status).toBe(400);
    expect(result.error.code).toBe("REQUEST_BODY_INVALID_JSON");
  });

  it("rejects a body over the cap when Content-Length is present", async () => {
    const result = await readJsonBody(
      jsonRequest(JSON.stringify({ pad: "x".repeat(200) })),
      64,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.status).toBe(413);
  });

  it("enforces the cap even when Content-Length is absent (chunked bypass)", async () => {
    // A streamed body carries no Content-Length. The old guard lived inside
    // `if (contentLength)` and was therefore skipped entirely for this shape.
    const oversized = new TextEncoder().encode(
      JSON.stringify({ pad: "x".repeat(500) }),
    );
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        // Deliver in small chunks so the cap must trip mid-stream.
        for (let index = 0; index < oversized.length; index += 32) {
          controller.enqueue(oversized.slice(index, index + 32));
        }
        controller.close();
      },
    });
    const request = new Request("https://example.test/api", {
      body: stream,
      // @ts-expect-error -- duplex is required for a streaming body in undici
      // and is not yet in the DOM RequestInit type.
      duplex: "half",
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    const result = await readJsonBody(request, 64);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.status).toBe(413);
  });
});
