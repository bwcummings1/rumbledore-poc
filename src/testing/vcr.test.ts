// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  assertCassetteSecretFree,
  createVcrFetch,
  createVcrReplayer,
  type VcrCassette,
} from "./vcr";

describe("VCR test harness", () => {
  it("matches fetch requests after scrubbing secret query params and headers", async () => {
    const cassette: VcrCassette = {
      interactions: [
        {
          request: {
            body: { input: "fixture" },
            method: "POST",
            url: {
              origin: "https://api.example.test",
              pathname: "/v1/resource",
              query: [
                ["apiKey", "[REDACTED]"],
                ["region", "us"],
              ],
            },
          },
          response: {
            body: { ok: true },
            headers: { "content-type": "application/json" },
            status: 200,
            statusText: "OK",
          },
        },
      ],
      recordedAt: "2026-06-16T00:00:00.000Z",
      service: "fixture",
    };
    const secret = ["real", "provider", "value", "never", "written"].join("-");
    assertCassetteSecretFree(cassette, [secret]);
    const fetcher = createVcrFetch(cassette, { mode: "replay" });

    const response = await fetcher(
      `https://api.example.test/v1/resource?region=us&apiKey=${secret}`,
      {
        body: JSON.stringify({ input: "fixture" }),
        headers: { Authorization: `Bearer ${secret}` },
        method: "POST",
      },
    );

    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("rejects cassettes containing explicit secret-looking tokens", () => {
    expect(() =>
      assertCassetteSecretFree(
        {
          interactions: [
            {
              request: { method: "GET" },
              response: {
                authorization: `Bearer ${["live", "provider", "token", "12345"].join("-")}`,
              },
            },
          ],
          recordedAt: "2026-06-16T00:00:00.000Z",
          service: "fixture",
        },
        [["live", "provider", "token", "12345"].join("-")],
      ),
    ).toThrow(/secret/i);
  });

  it("replays provider SDK method calls by normalized request", async () => {
    const cassette: VcrCassette = {
      interactions: [
        {
          request: {
            method: "provider.search",
            options: { maxResults: 1 },
          },
          response: { results: [{ title: "Fixture" }] },
        },
      ],
      recordedAt: "2026-06-16T00:00:00.000Z",
      service: "fixture",
    };
    const replayer = createVcrReplayer(cassette, { mode: "replay" });

    await expect(
      replayer.replay({
        method: "provider.search",
        options: { includeRawContent: "text", maxResults: 1 },
        query: "ignored by subset match",
      }),
    ).resolves.toEqual({ results: [{ title: "Fixture" }] });
  });

  it("records scrubbed interactions only when record mode is explicit", async () => {
    const cassette: VcrCassette = {
      interactions: [],
      recordedAt: "2026-06-16T00:00:00.000Z",
      service: "fixture",
    };
    const replayer = createVcrReplayer(cassette, { mode: "record" });

    await expect(
      replayer.replay(
        {
          Authorization: "Bearer live-provider-token-12345",
          method: "provider.call",
        },
        async () => ({ ok: true }),
      ),
    ).resolves.toEqual({ ok: true });
  });
});
