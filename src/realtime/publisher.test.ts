import { describe, expect, it } from "vitest";
import { leagueBlogChannel } from "./interfaces";
import { SupabaseRealtimePublisher } from "./publisher";

function okResponse(): Response {
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}

describe("realtime publisher", () => {
  it("uses the stable per-league blog channel name", () => {
    expect(leagueBlogChannel("league-123")).toBe("league:league-123:blog");
  });

  it("posts blog.published payloads to Supabase private broadcast", async () => {
    const calls: Array<{
      input: RequestInfo | URL;
      init: RequestInit | undefined;
    }> = [];
    const publisher = new SupabaseRealtimePublisher({
      apiKey: "supabase-service-key", // ubs:ignore — fake fixture value
      fetchFn: async (input, init) => {
        calls.push({ input, init });
        return okResponse();
      },
      url: "https://project.supabase.co/",
    });

    await publisher.publishLeagueBlogPublished({
      at: "2026-06-11T12:00:01.000Z",
      contentItemId: "post-1",
      leagueId: "league-123",
      persona: "commissioner",
      publishedAt: "2026-06-11T12:00:00.000Z",
      title: "Commissioner note",
      triggerKey: "weekly:1",
      type: "blog.published",
      v: 1,
    });

    expect(calls).toHaveLength(1);
    const call = calls[0];
    if (!call) throw new Error("expected fetch call");

    expect(call.input.toString()).toBe(
      "https://project.supabase.co/realtime/v1/api/broadcast/league%3Aleague-123%3Ablog/events/blog.published?private=true",
    );
    expect(call.init?.method).toBe("POST");
    expect(call.init?.headers).toEqual({
      apikey: "supabase-service-key", // ubs:ignore — fake fixture value
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(call.init?.body))).toMatchObject({
      contentItemId: "post-1",
      leagueId: "league-123",
      type: "blog.published",
      v: 1,
    });
  });

  it("throws when Supabase rejects the broadcast", async () => {
    const publisher = new SupabaseRealtimePublisher({
      apiKey: "supabase-service-key", // ubs:ignore — fake fixture value
      fetchFn: async () => new Response("nope", { status: 500 }),
      url: "https://project.supabase.co",
    });

    await expect(
      publisher.publishLeagueBlogPublished({
        at: "2026-06-11T12:00:01.000Z",
        contentItemId: "post-1",
        leagueId: "league-123",
        persona: "commissioner",
        publishedAt: "2026-06-11T12:00:00.000Z",
        title: "Commissioner note",
        triggerKey: "weekly:1",
        type: "blog.published",
        v: 1,
      }),
    ).rejects.toMatchObject({
      code: "REALTIME_BROADCAST_FAILED",
      status: 502,
    });
  });
});
