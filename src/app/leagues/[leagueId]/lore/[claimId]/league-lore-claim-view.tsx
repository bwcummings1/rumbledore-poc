"use client";

import {
  ArrowLeft,
  Bot,
  Check,
  Clock3,
  GitBranch,
  Landmark,
  Scale,
  ShieldCheck,
  X,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { onboardingPanelError, postJson } from "@/app/onboarding/client-http";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { LoreVoteChoice, StewardLoreAction } from "@/lore";
import type {
  LoreClaimCard,
  LoreClaimDetailData,
  LoreStewardActionResponse,
  LoreVoteCastResponse,
  LoreVoteStatusSummary,
} from "@/lore/member-ui";

const VOTE_CHOICES: Array<{
  choice: LoreVoteChoice;
  label: string;
  tone: string;
}> = [
  {
    choice: "affirm",
    label: "Affirm",
    tone: "border-positive/40 bg-positive/10 text-positive",
  },
  {
    choice: "reject",
    label: "Reject",
    tone: "border-destructive/40 bg-destructive/10 text-destructive",
  },
  {
    choice: "abstain",
    label: "Abstain",
    tone: "border-border bg-muted/30 text-muted-foreground",
  },
];

function formatDateTime(value: string | null): string {
  if (!value) {
    return "No close time set";
  }
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function statusLabel(claim: LoreClaimCard): string {
  switch (claim.status) {
    case "canon":
      switch (claim.ratifiedBy) {
        case "verified":
          return "Canon · on the record";
        case "steward":
          return "Canon · steward ratified";
        case "vote":
        case null:
          return "Canon · league decided";
      }
      return "Canon";
    case "disputed":
      return "Canon under challenge";
    case "pending":
      return "Pending";
    case "rejected":
      switch (claim.verification) {
        case "refuted":
          return "Refuted";
        default:
          return "Rejected";
      }
    case "superseded":
      return "Superseded";
    case "vote":
      return "Open vote";
    case "withdrawn":
      return "Withdrawn";
  }
}

function statusClass(status: LoreClaimCard["status"]): string {
  switch (status) {
    case "canon":
      return "border-positive/40 bg-positive/10 text-positive";
    case "vote":
      return "border-primary/40 bg-primary/10 text-primary";
    case "disputed":
    case "pending":
      return "border-highlight/40 bg-highlight/10 text-highlight";
    case "rejected":
    case "superseded":
    case "withdrawn":
      return "border-destructive/40 bg-destructive/10 text-destructive";
  }
}

function relationLabel(relation: LoreClaimCard["relation"]): string {
  switch (relation) {
    case "addendum":
      return "Addendum";
    case "dispute":
      return "Dispute";
    case "relitigation":
      return "Relitigation";
    case "response":
      return "Response";
    case "root":
      return "Original claim";
  }
}

function isChallenge(claim: LoreClaimCard): boolean {
  return claim.relation === "dispute" || claim.relation === "relitigation";
}

function voteRead(vote: LoreVoteStatusSummary): string {
  if (vote.passesAtClose) {
    return "Passing if the vote closed now.";
  }
  if (!vote.quorumMet) {
    return `Needs ${vote.affirmNeeded} more affirm ${vote.affirmNeeded === 1 ? "vote" : "votes"} to clear quorum and lead reject.`;
  }
  return "Quorum is met, but affirm must lead reject.";
}

function isSelectedChoice(
  currentChoice: LoreVoteChoice | null,
  choice: LoreVoteChoice,
): boolean {
  return currentChoice ? [currentChoice].includes(choice) : false;
}

interface ThreadNode {
  readonly children: ThreadNode[];
  readonly claim: LoreClaimCard;
}

function buildThreadTree(claims: readonly LoreClaimCard[]): ThreadNode[] {
  const nodesById = new Map<string, ThreadNode>();
  for (const claim of claims) {
    nodesById.set(claim.id, { children: [], claim });
  }
  const roots: ThreadNode[] = [];

  for (const node of nodesById.values()) {
    if (node.claim.branchOf) {
      const parent = nodesById.get(node.claim.branchOf);
      if (parent) {
        parent.children.push(node);
        continue;
      }
    }
    roots.push(node);
  }

  return roots;
}

function lineageAnnotation(
  node: ThreadNode,
  allClaims: readonly LoreClaimCard[],
): string | null {
  if (node.claim.status === "superseded") {
    const replacement = allClaims.find(
      (claim) =>
        claim.branchOf === node.claim.id &&
        isChallenge(claim) &&
        claim.status === "canon",
    );
    return replacement ? `Superseded by ${replacement.title}` : "Superseded";
  }
  if (
    node.claim.status === "canon" &&
    allClaims.some(
      (claim) =>
        claim.branchOf === node.claim.id &&
        isChallenge(claim) &&
        claim.status === "rejected",
    )
  ) {
    return "Challenged and upheld";
  }
  if (node.claim.status === "disputed") {
    return "Challenge open";
  }
  return null;
}

function ThreadNodeView({
  allClaims,
  leagueId,
  node,
  selectedClaimId,
}: {
  allClaims: readonly LoreClaimCard[];
  leagueId: string;
  node: ThreadNode;
  selectedClaimId: string;
}) {
  const annotation = lineageAnnotation(node, allClaims);
  const isSelected = node.claim.id === selectedClaimId;

  return (
    <div className="grid gap-3">
      <article
        className={cn(
          "rounded-card border bg-card p-4",
          isSelected ? "border-primary/50" : "border-border",
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-border bg-muted/30 px-2 py-1 text-xs font-medium text-muted-foreground">
            {relationLabel(node.claim.relation)}
          </span>
          <span
            className={cn(
              "rounded-full border px-2 py-1 text-xs font-medium",
              statusClass(node.claim.status),
            )}
          >
            {statusLabel(node.claim)}
          </span>
          {annotation ? (
            <span className="rounded-full border border-highlight/40 bg-highlight/10 px-2 py-1 text-xs font-medium text-highlight">
              {annotation}
            </span>
          ) : null}
        </div>
        <h3 className="mt-3 text-base font-semibold">
          <Link
            href={`/leagues/${encodeURIComponent(leagueId)}/lore/${encodeURIComponent(node.claim.id)}`}
            className="hover:text-primary"
          >
            {node.claim.title}
          </Link>
        </h3>
        <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">
          {node.claim.bodyPreview}
        </p>
        <p className="mt-3 text-xs font-medium text-muted-foreground">
          By {node.claim.author.displayName}
          {node.claim.author.isAi ? " - AI cast" : ""}
        </p>
      </article>

      {node.children.length > 0 ? (
        <div className="ml-3 grid gap-3 border-l border-border pl-3 sm:ml-5 sm:pl-5">
          {node.children.map((child) => (
            <ThreadNodeView
              allClaims={allClaims}
              key={child.claim.id}
              leagueId={leagueId}
              node={child}
              selectedClaimId={selectedClaimId}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function StewardControls({
  claim,
  onAction,
}: {
  claim: LoreClaimCard;
  onAction: (action: StewardLoreAction, reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [busyAction, setBusyAction] = useState<StewardLoreAction | null>(null);
  const actions: Array<{ action: StewardLoreAction; label: string }> =
    claim.status === "canon"
      ? [{ action: "veto", label: "Veto canon" }]
      : claim.status === "vote"
        ? [
            { action: "ratify", label: "Ratify" },
            { action: "reject", label: "Reject" },
            { action: "extend", label: "Extend once" },
          ]
        : [];

  if (actions.length === 0) {
    return null;
  }

  async function submit(action: StewardLoreAction) {
    if (!reason.trim()) {
      return;
    }
    setBusyAction(action);
    try {
      await onAction(action, reason.trim());
      setReason("");
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <section className="grid gap-3 rounded-card border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
        <h2 className="text-base font-semibold">Steward tiebreak</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Commissioner and data-steward actions require an audited reason.
      </p>
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Reason</span>
        <textarea
          value={reason}
          onChange={(event) => setReason(event.currentTarget.value)}
          className="min-h-20 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          maxLength={500}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        {actions.map((item) => (
          <Button
            key={item.action}
            type="button"
            variant={item.action === "veto" ? "destructive" : "secondary"}
            onClick={() => void submit(item.action)}
            disabled={!reason.trim() || busyAction !== null}
          >
            {item.action === "reject" || item.action === "veto" ? (
              <X data-icon="inline-start" />
            ) : (
              <Check data-icon="inline-start" />
            )}
            {busyAction === item.action ? "Working" : item.label}
          </Button>
        ))}
      </div>
    </section>
  );
}

export function LeagueLoreClaimView({ data }: { data: LoreClaimDetailData }) {
  const loreHref = `/leagues/${encodeURIComponent(data.league.id)}/lore`;
  const [claim, setClaim] = useState(data.claim);
  const [vote, setVote] = useState(data.claim.vote);
  const [busyChoice, setBusyChoice] = useState<LoreVoteChoice | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const threadTree = buildThreadTree(data.thread);

  async function castVote(choice: LoreVoteChoice) {
    setBusyChoice(choice);
    setError(null);
    setMessage(null);
    try {
      const response = await postJson<LoreVoteCastResponse>(data.voteApiUrl, {
        choice,
      });
      setVote(response);
      setClaim((current) => ({ ...current, vote: response }));
      setMessage(`Vote recorded: ${choice}.`);
    } catch (cause) {
      setError(onboardingPanelError(cause).message);
    } finally {
      setBusyChoice(null);
    }
  }

  async function stewardAction(action: StewardLoreAction, reason: string) {
    setError(null);
    setMessage(null);
    try {
      const response = await postJson<LoreStewardActionResponse>(
        data.stewardApiUrl,
        { action, reason },
      );
      setClaim((current) => ({ ...current, ...response.claim }));
      setVote(response.claim.vote);
      setMessage(`Steward action recorded: ${action}.`);
    } catch (cause) {
      setError(onboardingPanelError(cause).message);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col gap-6 px-4 py-5 pb-[calc(--spacing(6)+env(safe-area-inset-bottom))] sm:px-6">
      <header className="grid gap-4">
        <Link
          href={loreHref}
          className={cn(
            buttonVariants({ className: "w-fit", variant: "ghost" }),
          )}
        >
          <ArrowLeft data-icon="inline-start" />
          Lore
        </Link>

        <div className="grid gap-3 rounded-card border border-border bg-card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "rounded-full border px-2 py-1 text-xs font-medium",
                statusClass(claim.status),
              )}
            >
              {statusLabel(claim)}
            </span>
            {claim.author.isAi ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-highlight/40 bg-highlight/10 px-2 py-1 text-xs font-medium text-highlight">
                <Bot className="size-3" aria-hidden="true" />
                AI cast
              </span>
            ) : null}
          </div>
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-primary">
              <Landmark className="size-4" aria-hidden="true" />
              {data.league.name} lore
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">
              {claim.title}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              By {claim.author.displayName} · opened{" "}
              {formatDateTime(claim.createdAt)}
            </p>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-6">{claim.body}</p>
          {claim.subjects.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {claim.subjects.map((subject) => (
                <Link
                  key={subject.key}
                  href={`/leagues/${encodeURIComponent(data.league.id)}/lore?${new URLSearchParams({ subject: subject.key }).toString()}`}
                  className={cn(
                    buttonVariants({
                      className: "w-fit",
                      size: "sm",
                      variant: "outline",
                    }),
                  )}
                >
                  {subject.label}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      </header>

      {message ? (
        <div className="rounded-card border border-positive/40 bg-positive/10 px-3 py-2 text-sm text-positive">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-card border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {vote ? (
        <section className="grid gap-4 rounded-card border border-border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Scale className="size-4 text-primary" aria-hidden="true" />
                League vote
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {voteRead(vote)}
              </p>
            </div>
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock3 className="size-4" aria-hidden="true" />
              Closes {formatDateTime(vote.voteClosesAt)}
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            {VOTE_CHOICES.map((item) => (
              <button
                key={item.choice}
                type="button"
                onClick={() => void castVote(item.choice)}
                disabled={!vote.isOpen || Boolean(busyChoice)}
                className={cn(
                  "rounded-card border px-3 py-3 text-left transition disabled:opacity-50",
                  isSelectedChoice(vote.currentChoice, item.choice)
                    ? item.tone
                    : "border-border bg-muted/20 hover:bg-muted/40",
                )}
              >
                <span className="block text-sm font-semibold">
                  {item.label}
                </span>
                <span className="mt-1 block font-mono text-2xl font-semibold tabular-nums">
                  {vote.tally[item.choice]}
                </span>
                {isSelectedChoice(vote.currentChoice, item.choice) ? (
                  <span className="mt-1 block text-xs">Your vote</span>
                ) : null}
              </button>
            ))}
          </div>

          <div className="grid gap-2 rounded-md border border-border bg-muted/20 p-3 text-sm">
            <p>
              Threshold: affirm must beat reject and reach quorum of{" "}
              <span className="font-mono tabular-nums">
                {vote.tally.quorum}
              </span>{" "}
              out of{" "}
              <span className="font-mono tabular-nums">
                {vote.tally.activeMembers}
              </span>{" "}
              active members.
            </p>
            <p className="text-muted-foreground">
              Abstains and non-voters do not count as reject.
            </p>
          </div>
        </section>
      ) : (
        <section className="rounded-card border border-border bg-card p-4">
          <p className="text-sm font-semibold">No open vote</p>
          <p className="mt-2 text-sm text-muted-foreground">
            This claim is read-only in its current state.
          </p>
        </section>
      )}

      {data.verificationResult ? (
        <section className="rounded-card border border-border bg-card p-4">
          <h2 className="text-base font-semibold">Verification</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Asserted {data.verificationResult.assertedValue}; recorded{" "}
            {data.verificationResult.actualValue ?? "unavailable"}.
          </p>
        </section>
      ) : null}

      <section className="grid gap-4">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold">
            <GitBranch className="size-4 text-primary" aria-hidden="true" />
            Thread lineage
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Branches stay visible after verdicts, including disputes that
            replaced canon and challenges the league upheld.
          </p>
        </div>
        {threadTree.length > 0 ? (
          <div className="grid gap-3">
            {threadTree.map((node) => (
              <ThreadNodeView
                allClaims={data.thread}
                key={node.claim.id}
                leagueId={data.league.id}
                node={node}
                selectedClaimId={claim.id}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-card border border-dashed border-border bg-muted/20 p-4">
            <p className="text-sm font-medium">No branches yet</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Responses, addenda, disputes, and re-litigation will appear here.
            </p>
          </div>
        )}
      </section>

      {data.isSteward ? (
        <StewardControls claim={claim} onAction={stewardAction} />
      ) : null}
    </main>
  );
}
