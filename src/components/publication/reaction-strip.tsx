"use client";

import { useState, useTransition } from "react";
import { buttonVariants } from "@/components/ui/button";
import {
  CONTENT_REACTION_DISPLAY,
  CONTENT_REACTION_EMOJIS,
  type ContentReactionEmoji,
  type ContentReactionSummary,
} from "@/content/reaction-types";
import { cn } from "@/lib/utils";

function recastSummary(
  summary: ContentReactionSummary,
  emoji: ContentReactionEmoji,
): ContentReactionSummary {
  if (summary.currentEmoji === emoji) {
    return summary;
  }

  const previous = summary.currentEmoji;
  const counts = summary.counts.map((count) => {
    if (count.emoji === emoji) {
      return { ...count, count: count.count + 1 };
    }
    if (previous && count.emoji === previous) {
      return { ...count, count: Math.max(0, count.count - 1) };
    }
    return count;
  });
  return {
    ...summary,
    counts,
    currentEmoji: emoji,
    total: counts.reduce((sum, count) => sum + count.count, 0),
  };
}

async function postReaction(
  apiUrl: string,
  emoji: ContentReactionEmoji,
): Promise<ContentReactionSummary> {
  const response = await fetch(apiUrl, {
    body: JSON.stringify({ emoji }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  if (!response.ok) {
    throw new Error("Reaction failed");
  }
  return (await response.json()) as ContentReactionSummary;
}

export function ContentReactionStrip({
  className,
  summary,
  variant = "card",
}: {
  className?: string;
  summary: ContentReactionSummary;
  variant?: "article" | "card";
}) {
  const [state, setState] = useState(summary);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const canReact = Boolean(state.apiUrl);

  function onReact(emoji: ContentReactionEmoji) {
    if (!state.apiUrl || isPending) {
      return;
    }
    const previous = state;
    setError(null);
    setState((current) => recastSummary(current, emoji));
    startTransition(() => {
      void postReaction(state.apiUrl ?? "", emoji)
        .then((next) => setState(next))
        .catch(() => {
          setState(previous);
          setError("Reaction not saved.");
        });
    });
  }

  return (
    <fieldset
      className={cn(
        "grid gap-2",
        variant === "article"
          ? "panel mx-auto w-full max-w-[72ch] p-4"
          : "mt-1",
        className,
      )}
      data-slot="content-reactions"
    >
      <legend className="sr-only">Content reactions</legend>
      {variant === "article" ? (
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="eyebrow text-primary">Reader signal</p>
            <h2 className="heading-auspex text-base">Reactions</h2>
          </div>
          <p className="metric text-xs text-muted-foreground">
            {state.total} total
          </p>
        </div>
      ) : null}
      <div
        className={cn(
          "flex flex-wrap gap-1.5",
          variant === "article" && "gap-2",
        )}
      >
        {CONTENT_REACTION_EMOJIS.map((emoji) => {
          const display = CONTENT_REACTION_DISPLAY[emoji];
          const count =
            state.counts.find((candidate) => candidate.emoji === emoji)
              ?.count ?? 0;
          const pressed = state.currentEmoji === emoji;
          return (
            <button
              aria-label={`${display.label} reaction, ${count} ${
                count === 1 ? "vote" : "votes"
              }`}
              aria-pressed={pressed}
              className={cn(
                buttonVariants({
                  size: "sm",
                  variant: pressed ? "default" : "outline",
                }),
                "min-h-10 min-w-14 gap-1 px-2 font-mono text-xs tabular-nums",
                !canReact && "cursor-default",
              )}
              disabled={!canReact || isPending}
              key={emoji}
              onClick={() => onReact(emoji)}
              title={display.label}
              type="button"
            >
              <span aria-hidden="true">{display.glyph}</span>
              <span>{count}</span>
            </button>
          );
        })}
      </div>
      {error ? (
        <output className="text-xs text-destructive">{error}</output>
      ) : null}
    </fieldset>
  );
}
