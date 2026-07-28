import { describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({
  getAuth: () => ({
    handler: async () =>
      new Response(JSON.stringify({ reached: "better-auth" }), { status: 200 }),
  }),
}));

const { GET, POST } = await import("./[...all]/route");

/**
 * Leagues are Better Auth organizations, so enabling the organization plugin
 * also HTTP-exposes its member CRUD under this catch-all mount. Those endpoints
 * authorize against the plugin's own statements and skip `requireLeagueRole`,
 * the audit ledger, and league-scoped cleanup — so a league_admin refused by
 * the commissioner-only steward route could simply POST
 * /api/auth/organization/update-member-role instead.
 *
 * These tests pin the fence: membership mutations must not reach Better Auth,
 * and the rest of the auth surface must still pass through untouched.
 */

function post(path: string) {
  return new Request(`https://example.test${path}`, { method: "POST" });
}

describe("auth catch-all membership fence", () => {
  it("blocks organization role updates from reaching Better Auth", async () => {
    const response = await POST(
      post("/api/auth/organization/update-member-role"),
    );
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe("LEAGUE_MEMBERSHIP_ROUTE_DISABLED");
  });

  it("blocks organization member removal", async () => {
    const response = await POST(post("/api/auth/organization/remove-member"));
    expect(response.status).toBe(404);
  });

  it("blocks the fenced paths on GET as well as POST", async () => {
    const response = await GET(
      new Request("https://example.test/api/auth/organization/remove-member"),
    );
    expect(response.status).toBe(404);
  });

  it("ignores a trailing slash when matching", async () => {
    const response = await POST(post("/api/auth/organization/remove-member/"));
    expect(response.status).toBe(404);
  });

  it("lets the rest of the auth surface through", async () => {
    // Sign-in, sessions, invitations and organization reads are untouched — the
    // fence must be narrow, not a blanket block on the plugin.
    for (const path of [
      "/api/auth/sign-in/email",
      "/api/auth/get-session",
      "/api/auth/organization/list",
      "/api/auth/organization/get-full-organization",
      "/api/auth/organization/accept-invitation",
    ]) {
      const response = await POST(post(path));
      expect(response.status, `${path} should pass through`).toBe(200);
      const body = (await response.json()) as { reached?: string };
      expect(body.reached).toBe("better-auth");
    }
  });
});
