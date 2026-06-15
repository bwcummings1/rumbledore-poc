// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

const serverOnlyPushCredential = ["server", "only", "fixture"].join(":");
const serverOnlySubject = "mailto:ops@example.invalid";

vi.mock("@/core/env", () => ({
  getEnv: () => ({
    push: {
      mock: false,
      privateKey: serverOnlyPushCredential,
      publicKey: "public-push-fixture",
      subject: serverOnlySubject,
    },
  }),
}));

describe("GET /api/push/vapid-key", () => {
  it("serializes only the public VAPID key", async () => {
    const { GET } = await import("./route");

    const response = await GET();
    const parsed = await response.clone().json();
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(parsed).toEqual({
      mock: false,
      publicKey: "public-push-fixture",
    });
    expect(body).not.toContain(serverOnlyPushCredential);
    expect(body).not.toContain(serverOnlySubject);
  });
});
