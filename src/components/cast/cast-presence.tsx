import {
  ArrowRight,
  BadgePercent,
  BarChart3,
  Bot,
  Feather,
  Flame,
  Gavel,
  MessageSquareText,
  Mic,
  Radio,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import type { AiPersona } from "@/ai/personas";
import type {
  LeagueCastInsight,
  LeagueCastPersonaCard,
  LeagueCastTurn,
} from "@/cast/league-cast";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";
import { cn } from "@/lib/utils";

export type CastPersonaOrbState = "idle" | "muted" | "speaking" | "think";
export type CastPersonaOrbSize = "lg" | "md" | "sm" | "xs";
type LeagueCastInsightChip = NonNullable<LeagueCastInsight["chip"]>;

const personaIcons = {
  analyst: BarChart3,
  beat_reporter: Mic,
  betting_advisor: BadgePercent,
  commissioner: Gavel,
  narrator: Feather,
  trash_talker: Flame,
} satisfies Record<AiPersona, typeof Gavel>;

const orbStateLabels = {
  idle: "AI cast ready",
  muted: "AI muted",
  speaking: "AI cast speaking",
  think: "Generating...",
} satisfies Record<CastPersonaOrbState, string>;

const sizeClassNames = {
  lg: "orb-lg",
  md: "orb-md",
  sm: "orb-sm",
  xs: "orb-xs",
} satisfies Record<CastPersonaOrbSize, string>;

function formatPublishedAt(value: string): string {
  const publishedAt = new Date(value).getTime();
  if (!Number.isFinite(publishedAt)) {
    return "recently";
  }

  const diffMs = publishedAt - Date.now();
  const absMs = Math.abs(diffMs);
  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;
  const formatter = new Intl.RelativeTimeFormat("en-US", {
    numeric: "auto",
  });

  if (absMs < minuteMs) return "now";
  if (absMs < hourMs)
    return formatter.format(Math.round(diffMs / minuteMs), "minute");
  if (absMs < dayMs)
    return formatter.format(Math.round(diffMs / hourMs), "hour");
  return formatter.format(Math.round(diffMs / dayMs), "day");
}

function chipToneClassName(tone: LeagueCastInsightChip["tone"]) {
  switch (tone) {
    case "negative":
      return "border-negative/40 bg-negative/10 text-negative";
    case "positive":
      return "border-positive/40 bg-positive/10 text-positive";
    case "value":
      return "border-warning/40 bg-warning/10 text-warning";
    case "default":
      return "border-primary/40 bg-primary/10 text-primary";
  }
}

function CastPersonaOrb({
  className,
  label,
  persona,
  showGlyph = true,
  size = "sm",
  state = "idle",
}: {
  readonly className?: string;
  readonly label?: string;
  readonly persona: AiPersona;
  readonly showGlyph?: boolean;
  readonly size?: CastPersonaOrbSize;
  readonly state?: CastPersonaOrbState;
}) {
  const Icon = personaIcons[persona];
  const accessibleLabel = label ?? orbStateLabels[state];
  const orb = (
    <>
      {showGlyph ? (
        <Icon
          aria-hidden="true"
          className={cn(size === "xs" ? "size-2.5" : "size-3.5")}
        />
      ) : null}
    </>
  );

  if (label) {
    return (
      <span
        aria-label={accessibleLabel}
        className={cn("orb", sizeClassNames[size], className)}
        data-persona={persona}
        data-state={state}
        role="img"
      >
        {orb}
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn("orb", sizeClassNames[size], className)}
      data-persona={persona}
      data-state={state}
    >
      {orb}
    </span>
  );
}

function CastAiBadge({ className }: { readonly className?: string }) {
  return (
    <span
      className={cn(
        "metric inline-flex min-h-6 items-center gap-1 rounded-control border border-primary/40 bg-primary/10 px-2 text-xs font-bold text-primary",
        className,
      )}
    >
      <Bot aria-hidden="true" className="size-3" />
      AI cast
    </span>
  );
}

function CastPersonaByline({
  beat,
  className,
  name,
  persona,
  state = "idle",
}: {
  readonly beat: string;
  readonly className?: string;
  readonly name: string;
  readonly persona: AiPersona;
  readonly state?: CastPersonaOrbState;
}) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      <CastPersonaOrb persona={persona} state={state} />
      <div className="min-w-0">
        <p className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
          <span className="truncate font-display font-medium text-foreground">
            {name}
          </span>
          <CastAiBadge />
        </p>
        <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
          {beat}
        </p>
      </div>
    </div>
  );
}

function CastPersonaCard({ card }: { readonly card: LeagueCastPersonaCard }) {
  const state: CastPersonaOrbState = card.enabled ? "idle" : "muted";
  const performsWhen = card.performsWhen.slice(0, 3);
  const cadenceBars =
    card.recentOutputCount > 0
      ? Array.from(
          { length: Math.min(card.recentOutputCount, 5) },
          (_, index) => index,
        )
      : [0];

  return (
    <article
      className="panel grid gap-4 p-4"
      data-persona={card.persona}
      data-slot="cast-persona-card"
      data-state={card.enabled ? "enabled" : "muted"}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="relative inline-flex shrink-0">
            <CastPersonaOrb persona={card.persona} size="md" state={state} />
            <span className="chip-glyph absolute -right-2 -bottom-2 size-5 text-xs text-primary">
              {card.name.slice(0, 1)}
            </span>
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-base font-medium text-foreground">
              {card.name}
            </h2>
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
              {card.beat}
            </p>
          </div>
        </div>
        <StatusPill tone={card.enabled ? "live" : "neutral"} variant="soft">
          {card.enabled ? "performing" : "muted"}
        </StatusPill>
      </div>
      <p className="text-sm leading-6 text-muted-foreground">
        {card.enabled ? card.pointOfView : "Not performing in this league."}
      </p>
      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-3">
          <span className="eyebrow text-primary">Cadence</span>
          <span className="metric text-xs text-muted-foreground">
            {card.recentOutputCount} recent reads
          </span>
        </div>
        <div
          aria-label={`${card.name} recent output cadence`}
          className="flex h-8 items-end gap-1"
          role="img"
        >
          {cadenceBars.map((bar) => (
            <span
              aria-hidden="true"
              className={cn(
                "w-3 rounded-t-control bg-primary/40 shadow-[0_0_10px_var(--glow-lilac)]",
                !card.enabled && "bg-muted-foreground/35 shadow-none",
              )}
              key={bar}
              style={{ blockSize: `${Math.min(100, 34 + bar * 15)}%` }}
            />
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {performsWhen.map((item) => (
          <span
            className="rounded-control border border-[var(--hair)] px-2 py-1 text-xs text-muted-foreground"
            key={item}
          >
            {item}
          </span>
        ))}
      </div>
    </article>
  );
}

function CastRoster({
  cards,
  empty,
}: {
  readonly cards: readonly LeagueCastPersonaCard[];
  readonly empty?: ReactNode;
}) {
  if (cards.length === 0) {
    return (
      <>{empty ?? <EmptyState title="No cast cards are configured yet." />}</>
    );
  }

  return (
    <section
      aria-label="AI cast roster"
      className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
    >
      {cards.map((card) => (
        <CastPersonaCard card={card} key={card.persona} />
      ))}
    </section>
  );
}

function CastInsightCard({ insight }: { readonly insight: LeagueCastInsight }) {
  return (
    <article
      className="insight cell grid gap-3 p-4"
      data-persona={insight.persona}
      data-slot="cast-insight-card"
    >
      <div className="flex items-start justify-between gap-3">
        <CastPersonaByline
          beat={insight.beat}
          name={insight.name}
          persona={insight.persona}
          state="speaking"
        />
        <time
          className="metric shrink-0 text-xs text-muted-foreground"
          dateTime={insight.publishedAt}
        >
          {formatPublishedAt(insight.publishedAt)}
        </time>
      </div>
      <div className="grid gap-2">
        <h3 className="heading-auspex line-clamp-2 text-base leading-snug">
          {insight.claim}
        </h3>
        <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">
          {insight.summary}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {insight.chip ? (
          <span
            className={cn(
              "metric inline-flex min-h-8 items-center gap-2 rounded-control border px-2 text-xs font-bold",
              chipToneClassName(insight.chip.tone),
            )}
          >
            <Sparkles aria-hidden="true" className="size-3" />
            {insight.chip.label}: {insight.chip.value}
          </span>
        ) : (
          <span className="metric min-h-8 content-center text-xs text-muted-foreground">
            {insight.section.label}
          </span>
        )}
        <Link
          href={insight.href}
          className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
        >
          Read
          <ArrowRight data-icon="inline-end" />
        </Link>
      </div>
    </article>
  );
}

function CastInsightGrid({
  empty,
  insights,
}: {
  readonly empty?: ReactNode;
  readonly insights: readonly LeagueCastInsight[];
}) {
  if (insights.length === 0) {
    return (
      <>{empty ?? <EmptyState title="No cast reads have posted yet." />}</>
    );
  }

  return (
    <section
      aria-label="Cast insight cards"
      className="grid gap-3 lg:grid-cols-2"
    >
      {insights.map((insight) => (
        <CastInsightCard insight={insight} key={insight.id} />
      ))}
    </section>
  );
}

function CastChatThread({
  className,
  initiallyOpen = true,
  turns,
}: {
  readonly className?: string;
  readonly initiallyOpen?: boolean;
  readonly turns: readonly LeagueCastTurn[];
}) {
  return (
    <details
      className={cn("chat ai panel group grid gap-3 p-4", className)}
      data-slot="cast-chat-thread"
      open={initiallyOpen}
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 focus-visible:shadow-[var(--focus-ring-shadow)] focus-visible:outline-none">
        <span className="flex items-center gap-2">
          <Radio aria-hidden="true" className="size-4 text-primary" />
          <span className="eyebrow text-foreground">Cast thread</span>
        </span>
        <span className="metric text-xs text-muted-foreground">
          {turns.length} turns
        </span>
      </summary>
      {turns.length > 0 ? (
        <ol className="grid gap-3 border-t border-[var(--hair)] pt-3">
          {turns.map((turn, index) => (
            <li
              className="cell grid gap-2 p-3"
              data-slot="cast-chat-turn"
              key={turn.id}
            >
              <div className="flex items-start justify-between gap-3">
                <CastPersonaByline
                  beat={turn.beat}
                  name={turn.name}
                  persona={turn.persona}
                  state={index === 0 ? "speaking" : "idle"}
                />
                <time
                  className="metric shrink-0 text-xs text-muted-foreground"
                  dateTime={turn.publishedAt}
                >
                  {formatPublishedAt(turn.publishedAt)}
                </time>
              </div>
              <p className="text-sm leading-6 text-muted-foreground">
                {turn.message}
              </p>
              <Link
                href={turn.href}
                className="w-fit text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:shadow-[var(--focus-ring-shadow)] focus-visible:outline-none"
              >
                Open the dispatch
              </Link>
            </li>
          ))}
        </ol>
      ) : (
        <EmptyState
          icon={<MessageSquareText className="size-4" />}
          title="The cast thread is quiet"
        >
          <p>
            Published cast turns appear here after the next league-scoped
            dispatch.
          </p>
        </EmptyState>
      )}
    </details>
  );
}

function CastActivityDigest({
  count,
  className,
}: ComponentPropsWithoutRef<"p"> & { readonly count: number }) {
  return (
    <p
      aria-live="polite"
      className={cn("sr-only", className)}
      data-slot="cast-activity-digest"
    >
      {count === 1
        ? "The cast posted 1 new read."
        : `The cast posted ${count} new reads.`}
    </p>
  );
}

export {
  CastActivityDigest,
  CastAiBadge,
  CastChatThread,
  CastInsightCard,
  CastInsightGrid,
  CastPersonaByline,
  CastPersonaCard,
  CastPersonaOrb,
  CastRoster,
};
