"use client";

import { Check, Clock3, Scale, Vote } from "lucide-react";
import { useId, useState } from "react";
import { onboardingPanelError, postJson } from "@/app/onboarding/client-http";
import { StatusPill } from "@/components/ui/status-pill";
import { cn } from "@/lib/utils";
import type { LoreVoteChoice } from "@/lore";
import type {
  LorePollStatusSummary,
  LorePollVoteCastResponse,
  LoreVoteCastResponse,
  LoreVoteStatusSummary,
} from "@/lore/member-ui";

type VoteWidgetSize = "compact" | "full";

type LoreVoteWidgetProps =
  | {
      readonly mode: "lore";
      readonly size?: VoteWidgetSize;
      readonly title?: string;
      readonly vote: LoreVoteStatusSummary;
      readonly voteApiUrl: string;
    }
  | {
      readonly mode: "poll";
      readonly poll: LorePollStatusSummary;
      readonly size?: VoteWidgetSize;
      readonly title?: string;
    };

const LORE_CHOICES = [
  {
    choice: "affirm",
    label: "Affirm",
    selectedClassName: "border-positive/50 bg-positive/10 text-positive",
  },
  {
    choice: "reject",
    label: "Reject",
    selectedClassName:
      "border-destructive/50 bg-destructive/10 text-destructive",
  },
  {
    choice: "abstain",
    label: "Abstain",
    selectedClassName: "border-input bg-[var(--panel-2)] text-muted-foreground",
  },
] as const satisfies readonly {
  choice: LoreVoteChoice;
  label: string;
  selectedClassName: string;
}[];

function formatDateTime(value: string | null): string {
  if (!value) {
    return "No close time set";
  }
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  }).format(new Date(value));
}

function formatWindow(value: string | null): string {
  if (!value) {
    return "No close time set";
  }
  const closesAt = new Date(value).getTime();
  if (!Number.isFinite(closesAt)) {
    return formatDateTime(value);
  }
  const diffMs = closesAt - Date.now();
  const absMs = Math.abs(diffMs);
  const hourMs = 60 * 60 * 1000;
  const dayMs = 24 * hourMs;
  if (diffMs <= 0) {
    return "Voting closed";
  }
  if (absMs >= dayMs) {
    const days = Math.ceil(absMs / dayMs);
    return `Closes in ${days}d`;
  }
  const hours = Math.max(1, Math.ceil(absMs / hourMs));
  return `Closes in ${hours}h`;
}

function loreVoteRead(vote: LoreVoteStatusSummary): string {
  if (!vote.isOpen) {
    return "Voting closed.";
  }
  if (vote.passesAtClose) {
    return "Passing if it closed now.";
  }
  if (vote.affirmNeeded > 0) {
    return `Needs ${vote.affirmNeeded} more affirm ${vote.affirmNeeded === 1 ? "vote" : "votes"} to clear quorum and lead reject.`;
  }
  return "Quorum is met, but affirm must lead reject.";
}

function pollRead(poll: LorePollStatusSummary): string {
  if (!poll.isOpen) {
    return "Poll closed.";
  }
  if (poll.leadingOptionIdx === null) {
    return "No votes yet; top option wins at close.";
  }
  const leader = poll.options[poll.leadingOptionIdx];
  return leader
    ? `${leader.label} leads with ${leader.votes} ${leader.votes === 1 ? "vote" : "votes"}.`
    : "Top option wins at close.";
}

function stackedStyle(value: number, total: number) {
  return {
    inlineSize: `${total <= 0 ? 0 : Math.min(100, (value / total) * 100)}%`,
  };
}

function LoreMeter({ vote }: { readonly vote: LoreVoteStatusSummary }) {
  const readId = useId();
  const max = Math.max(vote.tally.activeMembers, vote.tally.totalVotes, 1);
  const quorumPercent = Math.min(100, (vote.tally.quorum / max) * 100);
  const meterText = `${vote.tally.affirm} affirm, ${vote.tally.reject} reject, ${vote.tally.abstain} abstain. Quorum is ${vote.tally.quorum} of ${vote.tally.activeMembers} active members.`;

  return (
    <div className="grid gap-2">
      <meter
        aria-describedby={readId}
        aria-label="Lore vote quorum meter"
        className="sr-only"
        max={max}
        min={0}
        value={Math.min(vote.tally.affirm, max)}
      >
        {meterText}
      </meter>
      <div
        aria-hidden="true"
        className="relative h-4 overflow-hidden rounded-full border border-[var(--hair)] bg-[var(--panel-2)]"
      >
        <span
          aria-hidden="true"
          className="auspex-vote-meter__fill absolute inset-y-0 left-0 bg-primary"
          style={stackedStyle(vote.tally.affirm, max)}
        />
        <span
          aria-hidden="true"
          className="absolute inset-y-0 bg-destructive"
          style={{
            insetInlineStart: `${Math.min(100, (vote.tally.affirm / max) * 100)}%`,
            ...stackedStyle(vote.tally.reject, max),
          }}
        />
        <span
          aria-hidden="true"
          className="absolute inset-y-0 bg-muted-foreground"
          style={{
            insetInlineStart: `${Math.min(100, ((vote.tally.affirm + vote.tally.reject) / max) * 100)}%`,
            ...stackedStyle(vote.tally.abstain, max),
          }}
        />
        <span
          aria-hidden="true"
          className="absolute inset-y-[-3px] w-px bg-warning shadow-[0_0_10px_var(--glow-amber)]"
          style={{ insetInlineStart: `${quorumPercent}%` }}
        />
      </div>
      <p className="metric text-xs text-muted-foreground" id={readId}>
        Quorum tick at {vote.tally.quorum} of {vote.tally.activeMembers} active
        members; abstain is neutral.
      </p>
    </div>
  );
}

function PollMeter({ poll }: { readonly poll: LorePollStatusSummary }) {
  const max = Math.max(...poll.options.map((option) => option.votes), 1);
  return (
    <div className="grid gap-2">
      {poll.options.map((option) => (
        <div className="grid gap-1" key={option.index}>
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="truncate text-muted-foreground">
              {option.label}
            </span>
            <span className="metric text-foreground">{option.votes}</span>
          </div>
          <meter
            aria-label={`${option.label} poll meter`}
            className="sr-only"
            max={max}
            min={0}
            value={option.votes}
          >
            {option.label}: {option.votes}{" "}
            {option.votes === 1 ? "vote" : "votes"}
          </meter>
          <div
            aria-hidden="true"
            className="h-2 overflow-hidden rounded-full bg-[var(--hair-2)]"
          >
            <span
              aria-hidden="true"
              className={cn(
                "block h-full rounded-full",
                poll.leadingOptionIdx === option.index
                  ? "bg-primary"
                  : "bg-muted-foreground",
              )}
              style={stackedStyle(option.votes, max)}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function LoreVoteWidget(props: LoreVoteWidgetProps) {
  const id = useId();
  const [loreVote, setLoreVote] = useState(
    props.mode === "lore" ? props.vote : null,
  );
  const [poll, setPoll] = useState(props.mode === "poll" ? props.poll : null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const size = props.size ?? "full";
  const isCompact = size === "compact";

  async function castLore(choice: LoreVoteChoice) {
    if (props.mode !== "lore" || !loreVote?.isOpen || busy) {
      return;
    }
    setBusy(choice);
    setError(null);
    setMessage(null);
    try {
      const response = await postJson<LoreVoteCastResponse>(props.voteApiUrl, {
        choice,
      });
      setLoreVote(response);
      setMessage(`Vote recorded: ${choice}.`);
    } catch (cause) {
      setError(onboardingPanelError(cause).message);
    } finally {
      setBusy(null);
    }
  }

  async function castPoll(optionIdx: number) {
    if (props.mode !== "poll" || !poll?.isOpen || busy) {
      return;
    }
    setBusy(`${optionIdx}`);
    setError(null);
    setMessage(null);
    try {
      const response = await postJson<LorePollVoteCastResponse>(
        poll.voteApiUrl,
        { optionIdx },
      );
      setPoll(response);
      setMessage(
        `Poll vote recorded: ${response.options[optionIdx]?.label ?? "option"}.`,
      );
    } catch (cause) {
      setError(onboardingPanelError(cause).message);
    } finally {
      setBusy(null);
    }
  }

  const activeVote = props.mode === "lore" ? loreVote : null;
  const activePoll = props.mode === "poll" ? poll : null;
  const title =
    props.title ?? (props.mode === "lore" ? "League vote" : "Settle-it poll");
  const open = props.mode === "lore" ? activeVote?.isOpen : activePoll?.isOpen;
  const read =
    props.mode === "lore" && activeVote
      ? loreVoteRead(activeVote)
      : activePoll
        ? pollRead(activePoll)
        : "Voting is unavailable.";

  return (
    <section
      aria-labelledby={`${id}-title`}
      className={cn("cell grid gap-3", isCompact ? "p-3" : "p-4")}
      data-slot="lore-vote-widget"
      data-state={open ? "open" : "closed"}
      data-vote-mode={props.mode}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            className="flex items-center gap-2 font-display text-sm font-semibold text-foreground"
            id={`${id}-title`}
          >
            {props.mode === "lore" ? (
              <Scale className="size-4 text-primary" aria-hidden="true" />
            ) : (
              <Vote className="size-4 text-primary" aria-hidden="true" />
            )}
            {title}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{read}</p>
        </div>
        <StatusPill tone={open ? "live" : "neutral"} variant="soft">
          <span suppressHydrationWarning>
            {formatWindow(
              props.mode === "lore"
                ? (activeVote?.voteClosesAt ?? null)
                : (activePoll?.closesAt ?? null),
            )}
          </span>
        </StatusPill>
      </div>

      {props.mode === "lore" && activeVote ? (
        <>
          <div
            aria-label="Lore vote choices"
            className={cn("grid gap-2", isCompact ? "" : "sm:grid-cols-3")}
            role="radiogroup"
          >
            {LORE_CHOICES.map((item) => {
              const selected = activeVote.currentChoice === item.choice;
              return (
                <label
                  className={cn(
                    "min-h-11 cursor-pointer rounded-control border px-3 py-2 text-left transition hover:border-primary/50 focus-within:shadow-[var(--focus-ring-shadow)] has-disabled:cursor-not-allowed has-disabled:opacity-55",
                    selected
                      ? item.selectedClassName
                      : "border-input bg-[var(--panel)] text-muted-foreground",
                  )}
                  key={item.choice}
                >
                  <input
                    checked={selected}
                    className="sr-only"
                    disabled={!activeVote.isOpen || Boolean(busy)}
                    name={`${id}-lore-vote`}
                    onChange={() => void castLore(item.choice)}
                    type="radio"
                  />
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{item.label}</span>
                    {selected ? (
                      <Check className="size-4" aria-hidden="true" />
                    ) : null}
                  </span>
                  <span className="metric mt-1 block text-xl">
                    {activeVote.tally[item.choice]}
                  </span>
                  {selected ? (
                    <span className="mt-1 block text-xs">Your vote</span>
                  ) : null}
                </label>
              );
            })}
          </div>
          <LoreMeter vote={activeVote} />
          <div className="grid gap-1 text-sm text-muted-foreground">
            <p>
              Window: {formatDateTime(activeVote.voteOpensAt)} -{" "}
              {formatDateTime(activeVote.voteClosesAt)}
            </p>
            <p aria-live="polite" className="sr-only">
              Affirm {activeVote.tally.affirm}, reject {activeVote.tally.reject}
              , abstain {activeVote.tally.abstain}. {read}
            </p>
          </div>
        </>
      ) : null}

      {props.mode === "poll" && activePoll ? (
        <>
          <div
            aria-label="Poll choices"
            className="grid gap-2"
            role="radiogroup"
          >
            {activePoll.options.map((option) => (
              <label
                className={cn(
                  "min-h-11 cursor-pointer rounded-control border px-3 py-2 text-left transition hover:border-primary/50 focus-within:shadow-[var(--focus-ring-shadow)] has-disabled:cursor-not-allowed has-disabled:opacity-55",
                  option.current
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-input bg-[var(--panel)] text-muted-foreground",
                )}
                key={`${activePoll.id}:${option.index}`}
              >
                <input
                  checked={option.current}
                  className="sr-only"
                  disabled={!activePoll.isOpen || Boolean(busy)}
                  name={`${id}-poll-vote`}
                  onChange={() => void castPoll(option.index)}
                  type="radio"
                />
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{option.label}</span>
                  {option.current ? (
                    <Check className="size-4" aria-hidden="true" />
                  ) : null}
                </span>
                <span className="metric mt-1 block text-xl">
                  {option.votes}
                </span>
              </label>
            ))}
          </div>
          <PollMeter poll={activePoll} />
          <div className="grid gap-1 text-sm text-muted-foreground">
            <p className="flex items-center gap-2">
              <Clock3 className="size-4" aria-hidden="true" />
              Closes {formatDateTime(activePoll.closesAt)}
            </p>
            <p>
              Top option wins when the cast closes this poll; no lore canon is
              settled until the verdict lands.
            </p>
            <p aria-live="polite" className="sr-only">
              {activePoll.options
                .map((option) => `${option.label} ${option.votes}`)
                .join(", ")}
              . {read}
            </p>
          </div>
        </>
      ) : null}

      {message ? (
        <p
          aria-live="polite"
          className="rounded-control border border-positive/40 bg-positive/10 px-3 py-2 text-sm text-positive"
        >
          {message}
        </p>
      ) : null}
      {error ? (
        <p
          aria-live="assertive"
          className="rounded-control border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}
      {!open ? (
        <output className="cell flex min-h-11 items-center gap-2 p-3 text-sm text-muted-foreground">
          <Clock3 className="size-4 text-primary" aria-hidden="true" />
          Voting closed. This widget is read-only.
        </output>
      ) : null}
    </section>
  );
}

export { LoreVoteWidget };
export type { LoreVoteWidgetProps };
