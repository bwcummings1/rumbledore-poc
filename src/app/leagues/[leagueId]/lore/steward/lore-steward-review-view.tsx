"use client";

import { ArrowLeft, Check, Clock3, ShieldCheck, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { onboardingPanelError, postJson } from "@/app/onboarding/client-http";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { StewardLoreAction } from "@/lore";
import type {
  LoreClaimCard,
  LoreStewardActionResponse,
  LoreStewardReviewData,
} from "@/lore/member-ui";

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

function needsTiebreak(claim: LoreClaimCard): boolean {
  const vote = claim.vote;
  return Boolean(
    vote &&
      vote.tally.affirm > vote.tally.reject &&
      vote.tally.affirm < vote.tally.quorum,
  );
}

function actionUrl(leagueId: string, claimId: string): string {
  return `/api/leagues/${leagueId}/lore/claims/${claimId}/steward`;
}

export function LoreStewardReviewView({
  data,
}: {
  data: LoreStewardReviewData;
}) {
  const [claims, setClaims] = useState(data.openVotes);
  const [reasonByClaim, setReasonByClaim] = useState<Record<string, string>>(
    {},
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loreHref = `/leagues/${encodeURIComponent(data.league.id)}/lore`;

  async function applyAction(claim: LoreClaimCard, action: StewardLoreAction) {
    const reason = reasonByClaim[claim.id]?.trim() ?? "";
    if (!reason) {
      return;
    }

    setBusy(`${claim.id}:${action}`);
    setMessage(null);
    setError(null);
    try {
      const response = await postJson<LoreStewardActionResponse>(
        actionUrl(data.league.id, claim.id),
        { action, reason },
      );
      setClaims((current) =>
        response.claim.status === "vote"
          ? current.map((candidate) =>
              candidate.id === response.claim.id ? response.claim : candidate,
            )
          : current.filter((candidate) => candidate.id !== response.claim.id),
      );
      setReasonByClaim((current) => ({ ...current, [claim.id]: "" }));
      setMessage(`Steward action recorded: ${action}.`);
    } catch (cause) {
      setError(onboardingPanelError(cause).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-6 px-4 py-5 pb-[calc(--spacing(6)+env(safe-area-inset-bottom))] sm:px-6">
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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-primary">
              Lore / Steward review
            </p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">
              {data.league.name}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Review open lore votes, quorum-short majorities, and close-window
              extensions with an audited reason.
            </p>
          </div>
          <ShieldCheck className="size-6 text-primary" aria-hidden />
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

      {claims.length > 0 ? (
        <section className="grid gap-3" aria-label="Open lore votes">
          {claims.map((claim) => (
            <article
              key={claim.id}
              className="grid gap-4 rounded-card border border-border bg-card p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold tracking-tight">
                      <Link
                        href={`/leagues/${encodeURIComponent(data.league.id)}/lore/${encodeURIComponent(claim.id)}`}
                        className="hover:text-primary"
                      >
                        {claim.title}
                      </Link>
                    </h2>
                    {needsTiebreak(claim) ? (
                      <span className="rounded-full border border-highlight/40 bg-highlight/10 px-2 py-1 text-xs font-medium text-highlight">
                        Quorum-short majority
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                    {claim.bodyPreview}
                  </p>
                </div>
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock3 className="size-4" aria-hidden />
                  Closes {formatDateTime(claim.vote?.voteClosesAt ?? null)}
                </p>
              </div>

              {claim.vote ? (
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)] sm:items-start">
                  <div className="grid gap-2 text-sm">
                    <div className="grid grid-cols-3 gap-2 text-center font-mono tabular-nums">
                      <span className="rounded-md bg-muted/40 px-2 py-1">
                        {claim.vote.tally.affirm} affirm
                      </span>
                      <span className="rounded-md bg-muted/40 px-2 py-1">
                        {claim.vote.tally.reject} reject
                      </span>
                      <span className="rounded-md bg-muted/40 px-2 py-1">
                        {claim.vote.tally.abstain} abstain
                      </span>
                    </div>
                    <p className="text-muted-foreground">
                      Quorum {claim.vote.tally.quorum} of{" "}
                      {claim.vote.tally.activeMembers};{" "}
                      {claim.vote.passesAtClose
                        ? "passing at close"
                        : `needs ${claim.vote.affirmNeeded} affirm ${claim.vote.affirmNeeded === 1 ? "vote" : "votes"}`}
                      .
                    </p>
                  </div>

                  <div className="grid gap-2">
                    <label className="grid gap-1 text-sm">
                      <span className="font-medium">Reason</span>
                      <textarea
                        value={reasonByClaim[claim.id] ?? ""}
                        onChange={(event) =>
                          setReasonByClaim((current) => ({
                            ...current,
                            [claim.id]: event.currentTarget.value,
                          }))
                        }
                        className="min-h-20 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                        maxLength={500}
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={
                          busy !== null ||
                          !(reasonByClaim[claim.id] ?? "").trim()
                        }
                        onClick={() => void applyAction(claim, "ratify")}
                      >
                        <Check data-icon="inline-start" />
                        Ratify
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        disabled={
                          busy !== null ||
                          !(reasonByClaim[claim.id] ?? "").trim()
                        }
                        onClick={() => void applyAction(claim, "reject")}
                      >
                        <X data-icon="inline-start" />
                        Reject
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={
                          busy !== null ||
                          !(reasonByClaim[claim.id] ?? "").trim()
                        }
                        onClick={() => void applyAction(claim, "extend")}
                      >
                        Extend once
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}
            </article>
          ))}
        </section>
      ) : (
        <p className="rounded-card border border-dashed border-border bg-muted/25 px-3 py-3 text-sm text-muted-foreground">
          No open lore votes need steward review.
        </p>
      )}
    </main>
  );
}
