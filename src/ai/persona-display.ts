import { type AiPersona, DEFAULT_PERSONA_CARDS } from "./personas";

export interface PersonaByline {
  detail: string;
  label: string;
}

export interface PersonaBylineRow {
  name: string | null;
  persona: AiPersona;
  purpose: string | null;
}

export type PersonaBylineMap = ReadonlyMap<AiPersona, PersonaByline>;

function cleanText(value: string | null | undefined): string | null {
  const cleaned = (value ?? "").replace(/\s+/g, " ").trim();
  return cleaned.length > 0 ? cleaned : null;
}

export function defaultPersonaByline(persona: AiPersona | null): PersonaByline {
  if (!persona) {
    return { detail: "League publication", label: "League blog" };
  }

  const defaults = DEFAULT_PERSONA_CARDS[persona];
  return {
    detail: defaults.purpose,
    label: defaults.name,
  };
}

export function buildPersonaBylineMap(
  rows: readonly PersonaBylineRow[],
): PersonaBylineMap {
  return new Map(
    rows.map((row) => {
      const defaults = DEFAULT_PERSONA_CARDS[row.persona];
      return [
        row.persona,
        {
          detail: cleanText(row.purpose) ?? defaults.purpose,
          label: cleanText(row.name) ?? defaults.name,
        },
      ] as const;
    }),
  );
}

export function resolvePersonaByline(
  persona: AiPersona | null,
  bylines?: PersonaBylineMap,
): PersonaByline {
  if (!persona) {
    return defaultPersonaByline(null);
  }
  return bylines?.get(persona) ?? defaultPersonaByline(persona);
}
