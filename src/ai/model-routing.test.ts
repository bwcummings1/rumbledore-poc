import { describe, expect, it } from "vitest";
import {
  defaultModelRouteConfig,
  parseModelRouteConfigJson,
  resolveModelRoute,
  resolveModelRouteKey,
} from "./model-routing";

describe("model routing", () => {
  it("defaults cheap Anthropic routing to bulk for every task", () => {
    const route = defaultModelRouteConfig("cheap", "anthropic");

    expect(
      resolveModelRouteKey({
        contentType: "weekly_recap",
        persona: "narrator",
        route,
      }),
    ).toBe("bulk");
    expect(
      resolveModelRouteKey({
        contentType: "awards_superlatives",
        persona: "trash_talker",
        route,
      }),
    ).toBe("bulk");
  });

  it("preserves mixed-tier flagship persona defaults as data", () => {
    const route = defaultModelRouteConfig("mixed", "anthropic");

    expect(
      resolveModelRouteKey({
        contentType: "weekly_recap",
        persona: "narrator",
        route,
      }),
    ).toBe("flagship");
    expect(
      resolveModelRouteKey({
        contentType: "power_rankings",
        persona: "analyst",
        route,
      }),
    ).toBe("bulk");
  });

  it("resolves exact overrides before persona defaults before content-type defaults", () => {
    const route = parseModelRouteConfigJson(
      JSON.stringify({
        contentTypes: { weekly_recap: "flagship" },
        default: "bulk",
        overrides: { "narrator|weekly_recap": "bulk" },
        personas: { narrator: "custom" },
      }),
      defaultModelRouteConfig("cheap", "anthropic"),
    );

    expect(
      resolveModelRouteKey({
        contentType: "weekly_recap",
        persona: "narrator",
        route,
      }),
    ).toBe("bulk");
    expect(
      resolveModelRouteKey({
        contentType: "season_arc",
        persona: "narrator",
        route,
      }),
    ).toBe("custom");
    expect(
      resolveModelRouteKey({
        contentType: "weekly_recap",
        persona: "analyst",
        route,
      }),
    ).toBe("flagship");
  });

  it("falls back to the route default when a requested custom provider is unavailable", () => {
    const route = parseModelRouteConfigJson(
      JSON.stringify({
        default: "flagship",
        overrides: { "trash_talker|awards_superlatives": "custom" },
      }),
      defaultModelRouteConfig("cheap", "anthropic"),
    );

    const resolved = resolveModelRoute(
      {
        contentType: "awards_superlatives",
        persona: "trash_talker",
        route,
      },
      {
        bulk: "bulk-client",
        flagship: "flagship-client",
      },
    );

    expect(resolved).toEqual({
      provider: "flagship-client",
      providerKey: "flagship",
      requestedProviderKey: "custom",
    });
  });

  it("does not fall forward to custom when Anthropic routes are unavailable", () => {
    const route = defaultModelRouteConfig("cheap", "anthropic");

    expect(
      resolveModelRoute(
        {
          contentType: "power_rankings",
          persona: "analyst",
          route,
        },
        { custom: "custom-client" },
      ),
    ).toBeNull();
  });
});
