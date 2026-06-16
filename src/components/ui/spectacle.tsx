import {
  AlertTriangle,
  BookMarked,
  Radio,
  ScrollText,
  Trophy,
  Zap,
} from "lucide-react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { cn } from "@/lib/utils";

type SpectacleMotionMode = "auto" | "off";
type SpectacleSeverity = "ambient" | "headliner" | "transient";
type SpectacleEventKind =
  | "bad-beat"
  | "big-win"
  | "canonized"
  | "record-broken"
  | "toast";

interface SpectacleEvent {
  readonly dedupeKey: string;
  readonly id: string;
  readonly kind: SpectacleEventKind;
  readonly severity: SpectacleSeverity;
}

interface SpectacleConductorState {
  readonly active: SpectacleEvent | null;
  readonly queue: readonly SpectacleEvent[];
  readonly seenDedupeKeys: readonly string[];
}

interface SpectacleConductorOptions {
  readonly maxQueue?: number;
  readonly maxSeenKeys?: number;
}

type WireVariant = "arena" | "digest" | "live";
type WireStatus = "empty" | "live" | "offline" | "reconnecting";
type WireItemKind =
  | "bet"
  | "cast"
  | "lore"
  | "record"
  | "score"
  | "swing"
  | "system";

interface WireItem {
  readonly fresh?: boolean;
  readonly href?: string;
  readonly id: string;
  readonly kind?: WireItemKind;
  readonly label: ReactNode;
  readonly meta?: ReactNode;
}

interface WireTickerProps extends ComponentPropsWithoutRef<"section"> {
  readonly expanded?: boolean;
  readonly items: readonly WireItem[];
  readonly motion?: SpectacleMotionMode;
  readonly status?: WireStatus;
  readonly variant?: WireVariant;
}

type LivePulseStatus = "fresh" | "live" | "offline" | "static";

interface LivePulseDotProps extends ComponentPropsWithoutRef<"output"> {
  readonly label?: string;
  readonly motion?: SpectacleMotionMode;
  readonly status?: LivePulseStatus;
  readonly withText?: boolean;
}

type CountUpTone = "default" | "live" | "negative" | "positive" | "value";

interface CountUpValueProps
  extends Omit<ComponentPropsWithoutRef<"output">, "children"> {
  readonly formatValue?: (value: number | string) => ReactNode;
  readonly label: string;
  readonly motion?: SpectacleMotionMode;
  readonly previousValue?: number | string;
  readonly tone?: CountUpTone;
  readonly value: number | string;
}

type ScoreboardStatus = "final" | "live" | "stale" | "upcoming";

interface ScoreboardMatchup {
  readonly awayLabel: string;
  readonly awayScore?: number | string;
  readonly homeLabel: string;
  readonly homeScore?: number | string;
  readonly id: string;
  readonly kickoffLabel?: string;
  readonly previousAwayScore?: number | string;
  readonly previousHomeScore?: number | string;
  readonly staleAsOf?: string;
  readonly status?: ScoreboardStatus;
  readonly winProbability?: number;
}

interface ScoreboardStripProps extends ComponentPropsWithoutRef<"section"> {
  readonly matchups: readonly ScoreboardMatchup[];
  readonly motion?: SpectacleMotionMode;
  readonly nextKickoffLabel?: ReactNode;
}

type CastOrbState = "idle" | "muted" | "offline" | "thinking" | "writing";

interface CastOrbStatusProps extends ComponentPropsWithoutRef<"output"> {
  readonly label?: ReactNode;
  readonly motion?: SpectacleMotionMode;
  readonly state?: CastOrbState;
}

type StingerKind = "bad-beat" | "big-win" | "canonized" | "record-broken";

interface SpectacleStingerProps
  extends Omit<ComponentPropsWithoutRef<"aside">, "title"> {
  readonly detail?: ReactNode;
  readonly kind: StingerKind;
  readonly metric?: ReactNode;
  readonly motion?: SpectacleMotionMode;
  readonly previous?: ReactNode;
  readonly title: ReactNode;
}

interface VoteThresholdMeterProps extends ComponentPropsWithoutRef<"section"> {
  readonly count: number;
  readonly label: string;
  readonly motion?: SpectacleMotionMode;
  readonly previousCount?: number;
  readonly threshold: number;
}

interface CanonizedMomentProps
  extends Omit<ComponentPropsWithoutRef<"article">, "title"> {
  readonly claim: ReactNode;
  readonly href?: string;
  readonly motion?: SpectacleMotionMode;
  readonly tallyLabel: ReactNode;
  readonly title?: ReactNode;
}

const severityRank = {
  ambient: 0,
  transient: 1,
  headliner: 2,
} satisfies Record<SpectacleSeverity, number>;

const wireVariantClasses = {
  arena: "border-warning/40 bg-warning/10",
  digest: "border-input bg-[var(--panel)]",
  live: "border-primary/40 bg-primary/10 shadow-[0_0_18px_var(--glow-lilac),var(--bevel)]",
} satisfies Record<WireVariant, string>;

const wireKindClasses = {
  bet: "text-warning",
  cast: "text-primary",
  lore: "text-primary",
  record: "text-warning",
  score: "text-foreground",
  swing: "text-positive",
  system: "text-muted-foreground",
} satisfies Record<WireItemKind, string>;

const pulseDotClasses = {
  fresh: "bg-highlight shadow-[0_0_14px_var(--glow-lilac)]",
  live: "bg-primary shadow-[0_0_14px_var(--glow-lilac)]",
  offline: "border border-muted-foreground bg-transparent",
  static: "bg-muted-foreground",
} satisfies Record<LivePulseStatus, string>;

const countToneClasses = {
  default: "metric text-foreground",
  live: "lcd lcd-live",
  negative: "metric text-negative",
  positive: "metric text-positive",
  value: "lcd",
} satisfies Record<CountUpTone, string>;

const castStateLabels = {
  idle: "Cast idle",
  muted: "Cast muted",
  offline: "Cast offline",
  thinking: "Cast is thinking",
  writing: "Cast is writing...",
} satisfies Record<CastOrbState, string>;

const stingerMetadata = {
  "bad-beat": {
    Icon: AlertTriangle,
    stamp: "TOUGH BEAT",
    classes: "border-negative/50 bg-negative/10",
    stampClasses: "border-negative/50 text-negative",
  },
  "big-win": {
    Icon: Trophy,
    stamp: "BIG WIN",
    classes: "border-positive/50 bg-positive/10",
    stampClasses: "border-positive/50 text-positive",
  },
  canonized: {
    Icon: BookMarked,
    stamp: "CANON",
    classes: "border-primary/50 bg-primary/10",
    stampClasses: "border-primary/50 text-primary",
  },
  "record-broken": {
    Icon: Zap,
    stamp: "RECORD",
    classes: "border-warning/50 bg-warning/10",
    stampClasses: "border-warning/50 text-warning",
  },
} satisfies Record<
  StingerKind,
  {
    readonly Icon: typeof AlertTriangle;
    readonly classes: string;
    readonly stamp: string;
    readonly stampClasses: string;
  }
>;

function createSpectacleConductorState(
  active: SpectacleEvent | null = null,
  queue: readonly SpectacleEvent[] = [],
): SpectacleConductorState {
  return {
    active,
    queue,
    seenDedupeKeys: [
      ...(active ? [active.dedupeKey] : []),
      ...queue.map((event) => event.dedupeKey),
    ],
  };
}

function enqueueSpectacleEvents(
  state: SpectacleConductorState,
  events: readonly SpectacleEvent[],
  options: SpectacleConductorOptions = {},
): SpectacleConductorState {
  const maxQueue = options.maxQueue ?? 8;
  const maxSeenKeys = options.maxSeenKeys ?? 64;
  const seen = new Set(state.seenDedupeKeys);
  let active = state.active;
  const queue = [...state.queue];

  for (const event of events) {
    if (seen.has(event.dedupeKey)) {
      continue;
    }
    seen.add(event.dedupeKey);

    if (!active) {
      active = event;
      continue;
    }

    queue.push(event);
  }

  queue.sort(
    (left, right) => severityRank[right.severity] - severityRank[left.severity],
  );

  return {
    active,
    queue: queue.slice(0, maxQueue),
    seenDedupeKeys: [...seen].slice(-maxSeenKeys),
  };
}

function completeSpectacleEvent(
  state: SpectacleConductorState,
): SpectacleConductorState {
  const [nextActive, ...queue] = state.queue;
  return {
    active: nextActive ?? null,
    queue,
    seenDedupeKeys: state.seenDedupeKeys,
  };
}

function shouldFireRecordBrokenStinger({
  needsReview = false,
  previousRecordId,
}: {
  readonly needsReview?: boolean;
  readonly previousRecordId?: string | null;
}): boolean {
  return Boolean(previousRecordId) && !needsReview;
}

function WireTicker({
  "aria-label": ariaLabel,
  className,
  expanded = false,
  items,
  motion = "auto",
  status = items.length > 0 ? "live" : "empty",
  variant = "live",
  ...props
}: WireTickerProps) {
  const isEmpty = items.length === 0;
  const statusLabel = wireStatusLabel(status);

  return (
    <section
      aria-label={ariaLabel ?? "League wire"}
      className={cn(
        "auspex-wire panel grid gap-2 overflow-hidden p-2",
        wireVariantClasses[variant],
        className,
      )}
      data-expanded={expanded ? "true" : undefined}
      data-motion={motion}
      data-slot="wire-ticker"
      data-state={status}
      data-variant={variant}
      {...props}
    >
      <div className="flex min-h-8 items-center justify-between gap-3 px-1">
        <div className="flex min-w-0 items-center gap-2">
          <ScrollText aria-hidden="true" className="size-4 text-primary" />
          <span className="eyebrow text-foreground">WIRE</span>
          <LivePulseDot
            label={statusLabel}
            motion={motion}
            status={status === "live" ? "live" : "static"}
          />
        </div>
        {status === "offline" || status === "reconnecting" ? (
          <span className="metric text-xs text-muted-foreground">
            {statusLabel}
          </span>
        ) : null}
      </div>

      {isEmpty ? (
        <p className="rounded-control border border-input bg-[var(--panel)] px-3 py-2 text-sm text-muted-foreground">
          The wire is quiet.
        </p>
      ) : (
        <>
          <div className="auspex-wire__viewport" data-slot="wire-marquee">
            <ul className="auspex-wire__track gap-2">
              {items.map((item) => (
                <WireTickerItem item={item} key={item.id} />
              ))}
              {items.map((item) => (
                <WireTickerItem
                  aria-hidden="true"
                  item={item}
                  key={`repeat-${item.id}`}
                />
              ))}
            </ul>
          </div>
          <ul
            className="auspex-wire__static-list gap-2"
            data-slot="wire-static-list"
          >
            {items.map((item) => (
              <WireTickerItem item={item} key={`static-${item.id}`} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function WireTickerItem({
  item,
  ...props
}: ComponentPropsWithoutRef<"li"> & {
  readonly item: WireItem;
}) {
  const kind = item.kind ?? "system";
  const content = (
    <>
      {item.fresh ? (
        <LivePulseDot label="Fresh wire item" status="fresh" />
      ) : null}
      <span className={cn("font-medium", wireKindClasses[kind])}>
        {item.label}
      </span>
      {item.meta ? (
        <span className="metric text-xs text-muted-foreground">
          {item.meta}
        </span>
      ) : null}
    </>
  );

  return (
    <li
      className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-control border border-input bg-[var(--panel)] px-3 text-sm"
      data-kind={kind}
      data-slot="wire-item"
      {...props}
    >
      {item.href ? (
        <a
          className="inline-flex min-h-10 items-center gap-2 text-inherit focus-visible:shadow-[var(--focus-ring-shadow)] focus-visible:outline-none"
          href={item.href}
        >
          {content}
        </a>
      ) : (
        content
      )}
    </li>
  );
}

function ScoreboardStrip({
  "aria-label": ariaLabel,
  className,
  matchups,
  motion = "auto",
  nextKickoffLabel = "Next kickoff pending",
  ...props
}: ScoreboardStripProps) {
  const hasMatchups = matchups.length > 0;

  return (
    <section
      aria-label={ariaLabel ?? "Live scoreboard"}
      className={cn("panel grid gap-2 p-2", className)}
      data-motion={motion}
      data-slot="scoreboard-strip"
      {...props}
    >
      <div className="flex min-h-8 items-center justify-between gap-3 px-1">
        <div className="flex min-w-0 items-center gap-2">
          <Radio aria-hidden="true" className="size-4 text-primary" />
          <span className="eyebrow text-foreground">Scoreboard</span>
        </div>
        <span className="metric text-xs text-muted-foreground">
          {hasMatchups ? "live rail" : nextKickoffLabel}
        </span>
      </div>

      {hasMatchups ? (
        <ul className="flex snap-x gap-2 overflow-x-auto pb-1">
          {matchups.map((matchup) => (
            <ScoreboardCard
              key={matchup.id}
              matchup={matchup}
              motion={motion}
            />
          ))}
        </ul>
      ) : (
        <p className="rounded-control border border-input bg-[var(--panel)] px-3 py-2 text-sm text-muted-foreground">
          No live games. {nextKickoffLabel}
        </p>
      )}
    </section>
  );
}

function ScoreboardCard({
  matchup,
  motion,
}: {
  readonly matchup: ScoreboardMatchup;
  readonly motion: SpectacleMotionMode;
}) {
  const status = matchup.status ?? "live";
  const winProbability = clampNumber(matchup.winProbability ?? 50, 0, 100);
  const scoreLabel = `${matchup.awayLabel} ${formatScore(matchup.awayScore)} at ${matchup.homeLabel} ${formatScore(matchup.homeScore)}`;

  return (
    <li
      aria-label={scoreLabel}
      className="cell grid min-w-64 snap-start gap-2 p-3"
      data-slot="scoreboard-card"
      data-status={status}
    >
      <div className="flex items-center justify-between gap-3">
        <LivePulseDot
          label={scoreboardStatusLabel(status)}
          motion={motion}
          status={
            status === "live"
              ? "live"
              : status === "stale"
                ? "offline"
                : "static"
          }
          withText
        />
        {status === "stale" && matchup.staleAsOf ? (
          <span className="metric text-xs text-muted-foreground">
            as of {matchup.staleAsOf}
          </span>
        ) : null}
      </div>
      <ScoreboardTeamLine
        label={matchup.awayLabel}
        motion={motion}
        previousScore={matchup.previousAwayScore}
        score={matchup.awayScore}
      />
      <ScoreboardTeamLine
        label={matchup.homeLabel}
        motion={motion}
        previousScore={matchup.previousHomeScore}
        score={matchup.homeScore}
      />
      {status === "upcoming" && matchup.kickoffLabel ? (
        <p className="metric text-xs text-muted-foreground">
          {matchup.kickoffLabel}
        </p>
      ) : (
        <div className="grid gap-1">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">
              {matchup.homeLabel} win probability
            </span>
            <span className="metric text-xs text-muted-foreground">
              {Math.round(winProbability)}%
            </span>
          </div>
          <div
            aria-label={`${matchup.homeLabel} win probability`}
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={winProbability}
            className="h-2 overflow-hidden rounded-full bg-[var(--hair-2)]"
            role="progressbar"
          >
            <span
              className="block h-full rounded-full bg-primary shadow-[0_0_14px_var(--glow-lilac)]"
              style={{ inlineSize: `${winProbability}%` }}
            />
          </div>
        </div>
      )}
    </li>
  );
}

function ScoreboardTeamLine({
  label,
  motion,
  previousScore,
  score,
}: {
  readonly label: string;
  readonly motion: SpectacleMotionMode;
  readonly previousScore?: number | string;
  readonly score?: number | string;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3">
      <span className="truncate text-sm font-medium text-foreground">
        {label}
      </span>
      <CountUpValue
        className="text-lg font-bold"
        label={`${label} score`}
        motion={motion}
        previousValue={previousScore}
        tone="live"
        value={formatScore(score)}
      />
    </div>
  );
}

function LivePulseDot({
  className,
  label,
  motion = "auto",
  status = "live",
  withText = false,
  ...props
}: LivePulseDotProps) {
  const resolvedLabel = label ?? livePulseLabel(status);

  return (
    <output
      aria-label={resolvedLabel}
      aria-live="off"
      className={cn("inline-flex items-center gap-1.5", className)}
      data-motion={motion}
      data-slot="live-pulse"
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          "auspex-live-dot inline-flex size-2.5 shrink-0 rounded-full ring-2 ring-background",
          pulseDotClasses[status],
        )}
        data-status={status}
      />
      {withText ? (
        <span className="text-xs font-medium text-muted-foreground">
          {resolvedLabel}
        </span>
      ) : (
        <span className="sr-only">{resolvedLabel}</span>
      )}
    </output>
  );
}

function CountUpValue({
  className,
  formatValue = defaultFormatValue,
  label,
  motion = "auto",
  previousValue,
  tone = "default",
  value,
  ...props
}: CountUpValueProps) {
  const formattedValue = formatValue(value);
  const changed =
    typeof previousValue !== "undefined" && previousValue !== value;
  const animated = motion !== "off" && changed;

  return (
    <output
      aria-label={`${label}: ${textFromReactNode(formattedValue)}`}
      aria-live="polite"
      className={cn(
        "auspex-count-up tabular-nums",
        countToneClasses[tone],
        className,
      )}
      data-animated={animated ? "true" : undefined}
      data-motion={motion}
      data-previous={
        typeof previousValue === "undefined"
          ? undefined
          : textFromReactNode(formatValue(previousValue))
      }
      data-slot="count-up"
      {...props}
    >
      {formattedValue}
    </output>
  );
}

function CastOrbStatus({
  className,
  label,
  motion = "auto",
  state = "idle",
  ...props
}: CastOrbStatusProps) {
  const resolvedLabel = label ?? castStateLabels[state];
  const orbState =
    state === "thinking" || state === "writing"
      ? "think"
      : state === "offline" || state === "muted"
        ? "offline"
        : "idle";

  return (
    <output
      aria-live="polite"
      className={cn("inline-flex min-h-11 items-center gap-2", className)}
      data-motion={motion}
      data-slot="cast-orb-status"
      data-state={state}
      {...props}
    >
      <span
        aria-hidden="true"
        className="orb orb-sm"
        data-motion={motion}
        data-state={orbState}
      />
      <span className="text-sm text-muted-foreground">{resolvedLabel}</span>
    </output>
  );
}

function SpectacleStinger({
  className,
  detail,
  kind,
  metric,
  motion = "auto",
  previous,
  title,
  ...props
}: SpectacleStingerProps) {
  const metadata = stingerMetadata[kind];
  const Icon = metadata.Icon;
  const animated = motion !== "off";
  const showSparks =
    animated && (kind === "big-win" || kind === "record-broken");

  return (
    <aside
      aria-live="polite"
      className={cn(
        "auspex-stinger panel relative grid gap-3 overflow-hidden p-4",
        metadata.classes,
        className,
      )}
      data-animated={animated ? "true" : undefined}
      data-kind={kind}
      data-motion={motion}
      data-slot="spectacle-stinger"
      {...props}
    >
      {showSparks ? <StingerSparks /> : null}
      <div className="flex items-start gap-3">
        <span className="chip-glyph">
          <Icon aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "metric rounded-control border px-2 py-0.5 text-xs font-bold",
                metadata.stampClasses,
              )}
              data-slot="stinger-stamp"
            >
              {metadata.stamp}
            </span>
            {metric ? (
              <span className="lcd text-lg font-bold">{metric}</span>
            ) : null}
          </div>
          <p className="mt-2 font-display text-base font-semibold text-foreground">
            {title}
          </p>
          {detail ? (
            <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
          ) : null}
          {previous ? (
            <p className="mt-2 metric text-xs text-muted-foreground">
              previous: {previous}
            </p>
          ) : null}
        </div>
      </div>
    </aside>
  );
}

function StingerSparks() {
  return (
    <span
      aria-hidden="true"
      className="auspex-stinger__sparks pointer-events-none absolute inset-0"
      data-slot="stinger-sparks"
    >
      <span className="absolute top-2 left-8 size-1.5 rounded-full bg-warning" />
      <span className="absolute top-5 right-10 size-1 rounded-full bg-positive" />
      <span className="absolute bottom-5 left-16 size-1 rounded-full bg-primary" />
      <span className="absolute right-6 bottom-3 size-1.5 rounded-full bg-warning" />
    </span>
  );
}

function VoteThresholdMeter({
  className,
  count,
  label,
  motion = "auto",
  previousCount,
  threshold,
  ...props
}: VoteThresholdMeterProps) {
  const safeThreshold = Math.max(threshold, 1);
  const safeCount = Math.max(count, 0);
  const percent = clampNumber((safeCount / safeThreshold) * 100, 0, 100);
  const thresholdReached = safeCount >= safeThreshold;
  const animated =
    motion !== "off" &&
    typeof previousCount === "number" &&
    previousCount !== safeCount;

  return (
    <section
      aria-label={label}
      aria-live="polite"
      className={cn("cell grid gap-2 p-3", className)}
      data-motion={motion}
      data-slot="vote-threshold-meter"
      data-threshold-reached={thresholdReached ? "true" : "false"}
      {...props}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="eyebrow text-foreground">{label}</span>
        <CountUpValue
          label={`${label} tally`}
          motion={motion}
          previousValue={previousCount}
          tone={thresholdReached ? "live" : "default"}
          value={`${safeCount} / ${safeThreshold}`}
        />
      </div>
      <div
        aria-label={`${label} threshold progress`}
        aria-valuemax={safeThreshold}
        aria-valuemin={0}
        aria-valuenow={Math.min(safeCount, safeThreshold)}
        aria-valuetext={`${safeCount} of ${safeThreshold}${thresholdReached ? ", threshold reached" : ""}`}
        className="h-3 overflow-hidden rounded-full bg-[var(--hair-2)]"
        role="progressbar"
      >
        <span
          className={cn(
            "auspex-vote-meter__fill block h-full rounded-full",
            thresholdReached ? "bg-primary" : "bg-warning",
          )}
          data-animated={animated ? "true" : undefined}
          style={{ inlineSize: `${percent}%` }}
        />
      </div>
      <p className="text-sm text-muted-foreground">
        {thresholdReached ? "Threshold reached." : "Voting remains open."}
      </p>
    </section>
  );
}

function CanonizedMoment({
  className,
  claim,
  href,
  motion = "auto",
  tallyLabel,
  title = "Ratified into canon",
  ...props
}: CanonizedMomentProps) {
  const animated = motion !== "off";
  const claimContent = href ? (
    <a
      className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline focus-visible:shadow-[var(--focus-ring-shadow)] focus-visible:outline-none"
      href={href}
    >
      {claim}
    </a>
  ) : (
    <span className="font-medium text-foreground">{claim}</span>
  );

  return (
    <article
      aria-live="polite"
      className={cn("panel grid gap-3 p-4", className)}
      data-motion={motion}
      data-slot="canonized-moment"
      {...props}
    >
      <div className="flex items-start gap-3">
        <span
          className="auspex-canon-seal chip-glyph"
          data-animated={animated ? "true" : undefined}
          data-slot="canon-seal"
        >
          <BookMarked aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="metric text-xs font-bold text-primary">CANON</p>
          <h3 className="font-display text-base font-semibold text-foreground">
            {title}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">{claimContent}</p>
          <p className="mt-2 metric text-xs text-muted-foreground">
            final tally: {tallyLabel}
          </p>
        </div>
      </div>
    </article>
  );
}

function wireStatusLabel(status: WireStatus): string {
  if (status === "offline") {
    return "offline";
  }
  if (status === "reconnecting") {
    return "reconnecting";
  }
  if (status === "empty") {
    return "quiet";
  }
  return "live";
}

function livePulseLabel(status: LivePulseStatus): string {
  if (status === "fresh") {
    return "fresh";
  }
  if (status === "offline") {
    return "offline";
  }
  if (status === "static") {
    return "inactive";
  }
  return "live";
}

function scoreboardStatusLabel(status: ScoreboardStatus): string {
  if (status === "final") {
    return "final";
  }
  if (status === "stale") {
    return "stale";
  }
  if (status === "upcoming") {
    return "upcoming";
  }
  return "live";
}

function formatScore(score: number | string | undefined): number | string {
  return typeof score === "undefined" ? "--" : score;
}

function defaultFormatValue(value: number | string): ReactNode {
  return value;
}

function textFromReactNode(value: ReactNode): string {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  return "value";
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export {
  CanonizedMoment,
  CastOrbStatus,
  CountUpValue,
  LivePulseDot,
  ScoreboardStrip,
  SpectacleStinger,
  VoteThresholdMeter,
  WireTicker,
  completeSpectacleEvent,
  createSpectacleConductorState,
  enqueueSpectacleEvents,
  shouldFireRecordBrokenStinger,
};
export type {
  CanonizedMomentProps,
  CastOrbStatusProps,
  CountUpTone,
  CountUpValueProps,
  LivePulseDotProps,
  LivePulseStatus,
  ScoreboardMatchup,
  ScoreboardStatus,
  ScoreboardStripProps,
  SpectacleConductorOptions,
  SpectacleConductorState,
  SpectacleEvent,
  SpectacleEventKind,
  SpectacleMotionMode,
  SpectacleSeverity,
  SpectacleStingerProps,
  StingerKind,
  VoteThresholdMeterProps,
  WireItem,
  WireItemKind,
  WireStatus,
  WireTickerProps,
  WireVariant,
};
