"use client";

import { ArrowLeft, CircleCheck, Target, Trophy } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type {
  LeaguePickemData,
  PickemSlateOption,
} from "@/betting/league-pickem";
import type { PickSelection } from "@/betting/pickem";
import { Banner } from "@/components/ui/banner";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";
import { StatTile } from "@/components/ui/stat-tile";
import { StatusPill } from "@/components/ui/status-pill";
import { cn } from "@/lib/utils";

/**
 * The league Pick 'em desk.
 *
 * One rule in here is a regression guard rather than a style choice: a staged
 * pick carries the idempotency key it was minted with, and every retry of that
 * pick reuses it. The bankroll view it replaces called
 * `generateIdempotencyKey()` inline in the fetch body, so a double-tap or a
 * network retry minted a fresh key and the server had no way to recognise the
 * replay. Under bankroll that double-staked money; under Pick 'em it would
 * double-count a pick and corrupt the league's accuracy, which is the number
 * the whole inter-league competition is ranked on.
 */

/** A selection the user has chosen but not yet sent. */
interface StagedPick {
  readonly awayTeam: string;
  readonly homeTeam: string;
  /**
   * Minted once, when the pick is staged, and reused for every attempt. This
   * is the whole point — see the file docstring.
   */
  readonly idempotencyKey: string;
  readonly marketId: string;
  readonly oddsSnapshotId: string;
  readonly selection: PickSelection;
  readonly selectionLabel: string;
}

type SubmitState =
  | { readonly message: null; readonly status: "idle" }
  | { readonly message: null; readonly status: "submitting" }
  | { readonly message: string; readonly status: "error" }
  | { readonly message: string; readonly status: "success" };

let fallbackKeyCounter = 0;

function mintIdempotencyKey(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  fallbackKeyCounter += 1;
  return `pick-${fallbackKeyCounter}-${String(performance.now()).replace(".", "")}`;
}

function formatAmericanOdds(price: number | null): string {
  if (price === null) return "--";
  return price > 0 ? `+${price}` : String(price);
}

function formatLine(line: number | null): string {
  if (line === null) return "";
  return line > 0 ? `+${line}` : String(line);
}

function formatPercent(ratio: number): string {
  return `${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
  }).format(ratio * 100)}%`;
}

function formatKickoff(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    timeZone: "UTC",
    weekday: "short",
  }).format(new Date(value));
}

function marketTypeLabel(type: string): string {
  switch (type) {
    case "moneyline":
      return "Moneyline";
    case "spread":
      return "Spread";
    case "total":
      return "Total";
    case "player_prop":
      return "Player prop";
    default:
      return type;
  }
}

/**
 * Which sides a market offers. Totals are over/under; everything else is
 * home/away. Offering the wrong pair would let a user submit a selection the
 * grader cannot score.
 */
function selectionsFor(option: PickemSlateOption): readonly {
  label: string;
  selection: PickSelection;
  price: number | null;
}[] {
  if (option.marketType === "total") {
    return [
      {
        label: `Over ${formatLine(option.line)}`.trim(),
        price: option.overPrice,
        selection: "over",
      },
      {
        label: `Under ${formatLine(option.line)}`.trim(),
        price: option.underPrice,
        selection: "under",
      },
    ];
  }
  const spread = option.marketType === "spread" ? formatLine(option.line) : "";
  return [
    {
      label:
        `${option.awayTeam} ${spread ? formatLine(-(option.line ?? 0)) : ""}`.trim(),
      price: option.awayPrice,
      selection: "away",
    },
    {
      label: `${option.homeTeam} ${spread}`.trim(),
      price: option.homePrice,
      selection: "home",
    },
  ];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function submitErrorMessage(payload: unknown): string {
  if (isRecord(payload) && isRecord(payload.error)) {
    const message = payload.error.message;
    if (typeof message === "string" && message.length > 0) {
      return message;
    }
  }
  return "That pick could not be submitted. Try again.";
}

export function LeaguePickemView({
  data,
  leagueId,
}: {
  readonly data: LeaguePickemData;
  readonly leagueId: string;
}) {
  const router = useRouter();
  const [staged, setStaged] = useState<Record<string, StagedPick>>({});
  const [submitState, setSubmitState] = useState<SubmitState>({
    message: null,
    status: "idle",
  });

  const stagedList = useMemo(() => Object.values(staged), [staged]);
  const remainingAfterStaged = Math.max(
    data.you.remainingPicks - stagedList.length,
    0,
  );
  const allowanceExhausted = remainingAfterStaged === 0;

  if (data.status === "no_open_week" || data.week === null) {
    return (
      <main className="mx-auto grid min-h-dvh w-full max-w-5xl gap-6 px-4 py-5 sm:px-6">
        <EmptyState
          icon={<Target aria-hidden="true" />}
          title="No pick week is open"
        >
          Picks open when the commissioner starts the week. Check back once the
          slate is posted.
        </EmptyState>
      </main>
    );
  }

  const week = data.week;

  function toggle(option: PickemSlateOption, selection: PickSelection) {
    setStaged((current) => {
      const next = { ...current };
      const existing = next[option.marketId];
      if (existing && existing.selection === selection) {
        delete next[option.marketId];
        return next;
      }
      // Re-staging the other side of a market the user already staged keeps
      // the original key: it is still one pick on one market, and minting a
      // second key would let both sides land if the first attempt was in
      // flight.
      next[option.marketId] = {
        awayTeam: option.awayTeam,
        homeTeam: option.homeTeam,
        idempotencyKey: existing?.idempotencyKey ?? mintIdempotencyKey(),
        marketId: option.marketId,
        oddsSnapshotId: option.oddsSnapshotId,
        selection,
        selectionLabel:
          selectionsFor(option).find((row) => row.selection === selection)
            ?.label ?? selection,
      };
      return next;
    });
  }

  async function submitStaged() {
    if (stagedList.length === 0) return;
    setSubmitState({ message: null, status: "submitting" });

    const failed: Record<string, StagedPick> = {};
    let accepted = 0;
    let lastError: string | null = null;

    for (const pick of stagedList) {
      let response: Response;
      // A stalled request must not strand the desk: without a bound, the
      // submit button spins forever and the user's remaining picks go
      // unspent, which under absolute-denominator scoring is the same as
      // getting them wrong. Timing out is safe precisely because the key is
      // stable — the retry cannot double-count.
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15_000);
      try {
        response = await fetch(`/api/leagues/${leagueId}/picks`, {
          body: JSON.stringify({
            idempotencyKey: pick.idempotencyKey,
            oddsSnapshotId: pick.oddsSnapshotId,
            pickWeekId: week.pickWeekId,
            selection: pick.selection,
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
          signal: controller.signal,
        });
      } catch (error) {
        // The pick stays staged WITH ITS KEY so the retry is recognised as a
        // replay rather than landing a second pick.
        failed[pick.marketId] = pick;
        lastError =
          error instanceof DOMException && error.name === "AbortError"
            ? "That pick timed out. Try again — it will not be double-counted."
            : "Picks could not be sent. Check your connection.";
        continue;
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        failed[pick.marketId] = pick;
        lastError = submitErrorMessage(await response.json().catch(() => ({})));
        continue;
      }
      accepted += 1;
    }

    setStaged(failed);
    if (lastError !== null) {
      setSubmitState({ message: lastError, status: "error" });
    } else {
      setSubmitState({
        message: `${accepted} ${accepted === 1 ? "pick" : "picks"} locked in.`,
        status: "success",
      });
    }
    router.refresh();
  }

  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-5xl gap-6 px-4 py-5 sm:px-6">
      <header className="panel grid gap-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href={`/leagues/${leagueId}`}
            className={cn(
              buttonVariants({ className: "w-fit", variant: "ghost" }),
            )}
          >
            <ArrowLeft data-icon="inline-start" />
            League home
          </Link>
          <StatusPill tone="live">
            Week {week.week} &middot; {week.season}
          </StatusPill>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-primary">
          <Target className="size-5" aria-hidden="true" />
          <p className="eyebrow">Pick &rsquo;em</p>
        </div>
        <p className="text-sm text-muted-foreground">
          Picks close {formatKickoff(week.closesAt)}. Each game locks at its own
          kickoff. An unsubmitted pick counts the same as a wrong one, so the
          allowance is worth spending.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Your picks"
          value={`${data.you.submittedPicks} / ${week.maxPicksPerUser}`}
          caption={`${remainingAfterStaged} left${
            stagedList.length > 0 ? ` after ${stagedList.length} staged` : ""
          }`}
        />
        <StatTile
          label="League accuracy"
          tone="amber"
          value={formatPercent(data.league.accuracy)}
          caption={`${data.league.correctPicks} of ${data.league.scorablePicks} scorable`}
        />
        <StatTile
          label="Participation"
          value={formatPercent(data.league.participationRate)}
          caption="90% floor for prize eligibility"
        />
        <StatTile
          label="Prize eligible"
          tone={data.league.isEligibleForWeeklyPrize ? "lilac" : "default"}
          value={data.league.isEligibleForWeeklyPrize ? "Yes" : "Not yet"}
          caption="Eligibility never changes the score"
        />
      </section>

      <Progress
        label="Weekly participation"
        value={Math.round(data.league.participationRate * 100)}
        tone="lilac"
        showValue
      />

      {submitState.status === "error" ? (
        <Banner tone="danger" title="Some picks did not land">
          {submitState.message}
        </Banner>
      ) : null}
      {submitState.status === "success" ? (
        <Banner tone="ok" title="Picks submitted">
          {submitState.message}
        </Banner>
      ) : null}

      {stagedList.length > 0 ? (
        <section className="panel grid gap-3 p-4">
          <h2 className="text-sm font-semibold">
            Staged picks ({stagedList.length})
          </h2>
          <ul className="grid gap-2">
            {stagedList.map((pick) => (
              <li
                key={pick.marketId}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span>
                  {pick.selectionLabel}
                  <span className="text-muted-foreground">
                    {" "}
                    &middot; {pick.awayTeam} at {pick.homeTeam}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <Button
            type="button"
            onClick={submitStaged}
            disabled={submitState.status === "submitting"}
          >
            {submitState.status === "submitting"
              ? "Submitting..."
              : `Submit ${stagedList.length} ${stagedList.length === 1 ? "pick" : "picks"}`}
          </Button>
        </section>
      ) : null}

      <section className="grid gap-3">
        <h2 className="text-sm font-semibold">This week&rsquo;s slate</h2>
        {data.slate.length === 0 ? (
          <EmptyState
            icon={<Target aria-hidden="true" />}
            title="No open games"
          >
            Every game on the board has started or closed. New lines post as the
            next slate is priced.
          </EmptyState>
        ) : (
          <ul className="grid gap-3">
            {data.slate.map((option) => {
              const stagedHere = staged[option.marketId];
              return (
                <li key={option.marketId} className="panel grid gap-2 p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-semibold">
                      {option.awayTeam} at {option.homeTeam}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {marketTypeLabel(option.marketType)} &middot;{" "}
                      {formatKickoff(option.startTime)}
                    </p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {selectionsFor(option).map((row) => {
                      const isStaged = stagedHere?.selection === row.selection;
                      // A market the user has no allowance left for stays
                      // visible but unpickable: hiding it would make the board
                      // look like it shrank.
                      const blocked =
                        option.locked || (allowanceExhausted && !isStaged);
                      return (
                        <Button
                          key={row.selection}
                          type="button"
                          variant={isStaged ? "default" : "outline"}
                          disabled={blocked}
                          aria-pressed={isStaged}
                          onClick={() => toggle(option, row.selection)}
                        >
                          {isStaged ? (
                            <CircleCheck data-icon="inline-start" />
                          ) : null}
                          {row.label} {formatAmericanOdds(row.price)}
                        </Button>
                      );
                    })}
                  </div>
                  {option.locked ? (
                    <p className="text-xs text-muted-foreground">
                      Locked &mdash; this game has started.
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {data.you.picks.length > 0 ? (
        <section className="panel grid gap-3 p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Trophy className="size-4" aria-hidden="true" />
            Submitted picks
          </h2>
          <ul className="grid gap-2">
            {data.you.picks.map((pick) => (
              <li
                key={pick.pickId}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span>
                  {pick.awayTeam} at {pick.homeTeam}
                  <span className="text-muted-foreground">
                    {" "}
                    &middot; {pick.selection}
                  </span>
                </span>
                <StatusPill
                  tone={
                    pick.status === "correct"
                      ? "success"
                      : pick.status === "incorrect"
                        ? "danger"
                        : "neutral"
                  }
                >
                  {pick.status}
                </StatusPill>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
