export const CONTENT_REACTION_EMOJIS = [
  "fire",
  "skull",
  "laugh",
  "trash",
] as const;

export type ContentReactionEmoji = (typeof CONTENT_REACTION_EMOJIS)[number];

export const CONTENT_REACTION_DISPLAY: Record<
  ContentReactionEmoji,
  { glyph: string; label: string }
> = {
  fire: { glyph: "🔥", label: "Fire" },
  skull: { glyph: "💀", label: "Skull" },
  laugh: { glyph: "😂", label: "Laugh" },
  trash: { glyph: "🗑️", label: "Trash" },
};

export interface ContentReactionCount {
  count: number;
  emoji: ContentReactionEmoji;
  glyph: string;
  label: string;
}

export interface ContentReactionSummary {
  apiUrl?: string;
  counts: ContentReactionCount[];
  currentEmoji: ContentReactionEmoji | null;
  total: number;
}

export function isContentReactionEmoji(
  value: string,
): value is ContentReactionEmoji {
  return (CONTENT_REACTION_EMOJIS as readonly string[]).includes(value);
}
