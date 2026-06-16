import { describe, expect, it } from "vitest";
import {
  AI_PERSONAS,
  DEFAULT_PERSONA_CARDS,
  DEFAULT_TONE_PROFILES,
  DEFAULT_TONE_VERSION,
  normalizeToneProfile,
  renderToneProfileInstructions,
} from "./personas";

describe("persona cast defaults", () => {
  it("defines the six-persona cast with beat, point of view, and performance contract", () => {
    expect(AI_PERSONAS).toEqual([
      "commissioner",
      "analyst",
      "narrator",
      "trash_talker",
      "beat_reporter",
      "betting_advisor",
    ]);

    for (const persona of AI_PERSONAS) {
      const card = DEFAULT_PERSONA_CARDS[persona];
      expect(card.persona).toBe(persona);
      expect(card.beat.length).toBeGreaterThan(10);
      expect(card.pointOfView.length).toBeGreaterThan(10);
      expect(card.performsWhen.length).toBeGreaterThan(0);
      expect(card.triggerConfig).toEqual(expect.any(Object));
      expect(card.toneVersion).toBe(DEFAULT_TONE_VERSION);
      expect(card.toneProfile).toEqual(DEFAULT_TONE_PROFILES[persona]);
      expect(card.toneProfile.beats.length).toBeGreaterThan(0);
      expect(card.toneProfile.styleDirectives.length).toBeGreaterThan(0);
      expect(card.toneProfile.diction.length).toBeGreaterThan(0);
      expect(card.toneProfile.dosAndDonts.length).toBeGreaterThan(0);
      expect(card.toneProfile.guardrails.loreCanonContract).toEqual(
        expect.arrayContaining([expect.stringContaining("citedCanonClaimIds")]),
      );
      expect(card.toneProfile.guardrails.noLeakage).toEqual(
        expect.arrayContaining([expect.stringContaining("other leagues")]),
      );
      expect(card.toneProfile.guardrails.noRealMoney).toEqual(
        expect.arrayContaining([expect.stringContaining("real-money")]),
      );
    }

    expect(DEFAULT_PERSONA_CARDS.beat_reporter).toMatchObject({
      enabled: true,
      name: "Beat Reporter",
      triggerConfig: {
        cadences: ["mid-week", "offseason-beat"],
        events: ["transaction", "waiver", "bet.placed"],
      },
    });
    expect(DEFAULT_PERSONA_CARDS.betting_advisor).toMatchObject({
      enabled: true,
      triggerConfig: {
        cadences: ["post-odds-refresh"],
        events: ["bet.settled", "arena.standings.swing"],
      },
    });
  });

  it("normalizes partial persisted tone profiles against persona defaults", () => {
    const normalized = normalizeToneProfile(
      {
        beats: ["Custom desk"],
        guardrails: {
          noRealMoney: ["Custom play-money clause"],
        },
        styleDirectives: [],
      },
      "beat_reporter",
    );

    expect(normalized).toMatchObject({
      beats: ["Custom desk"],
      pointOfView: DEFAULT_TONE_PROFILES.beat_reporter.pointOfView,
    });
    expect(normalized.styleDirectives).toEqual(
      DEFAULT_TONE_PROFILES.beat_reporter.styleDirectives,
    );
    expect(normalized.guardrails.noRealMoney).toEqual([
      "Custom play-money clause",
    ]);
    expect(normalized.guardrails.noLeakage).toEqual(
      DEFAULT_TONE_PROFILES.beat_reporter.guardrails.noLeakage,
    );
  });

  it("renders tone profiles as prompt-ready instructions", () => {
    const lines = renderToneProfileInstructions(
      DEFAULT_TONE_PROFILES.trash_talker,
    );

    expect(lines).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Tone beats:"),
        expect.stringContaining("Style directives:"),
        expect.stringContaining("Lore canon contract:"),
        expect.stringContaining("No real-money framing:"),
      ]),
    );
  });
});
