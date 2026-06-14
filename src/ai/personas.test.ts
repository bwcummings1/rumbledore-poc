import { describe, expect, it } from "vitest";
import { AI_PERSONAS, DEFAULT_PERSONA_CARDS } from "./personas";

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
    }

    expect(DEFAULT_PERSONA_CARDS.beat_reporter).toMatchObject({
      enabled: true,
      name: "Beat Reporter",
      triggerConfig: {
        cadences: ["mid-week"],
        events: ["transaction", "waiver", "bet.placed"],
      },
    });
    expect(DEFAULT_PERSONA_CARDS.betting_advisor.enabled).toBe(false);
  });
});
