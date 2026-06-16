import type { AiPersona } from "./personas";

export const ANTHROPIC_FLAGSHIP_MODEL = "claude-opus-4-8";
export const ANTHROPIC_BULK_MODEL = "claude-haiku-4-5-20251001";
export const VOYAGE_EMBEDDING_MODEL = "voyage-4-lite";

export const ANTHROPIC_MODEL_TIERS = ["cheap", "mixed"] as const;
export type AnthropicModelTier = (typeof ANTHROPIC_MODEL_TIERS)[number];

export const ANTHROPIC_FLAGSHIP_PERSONAS = [
  "commissioner",
  "narrator",
  "trash_talker",
  "beat_reporter",
] as const satisfies readonly AiPersona[];

const flagshipPersonas = new Set<AiPersona>(ANTHROPIC_FLAGSHIP_PERSONAS);

export function cheapAnthropicModelForPersona(_persona: AiPersona): string {
  return ANTHROPIC_BULK_MODEL;
}

export function mixedAnthropicModelForPersona(persona: AiPersona): string {
  return flagshipPersonas.has(persona)
    ? ANTHROPIC_FLAGSHIP_MODEL
    : ANTHROPIC_BULK_MODEL;
}

export function anthropicModelForTier(
  tier: AnthropicModelTier,
): (persona: AiPersona) => string {
  return tier === "mixed"
    ? mixedAnthropicModelForPersona
    : cheapAnthropicModelForPersona;
}
