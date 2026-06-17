"use client";

import { ArrowLeft, Check, Clock3, ShieldCheck, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { onboardingPanelError, postJson } from "@/app/onboarding/client-http";
import { Banner } from "@/components/ui/banner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { KVList } from "@/components/ui/kv";
import { StatTile } from "@/components/ui/stat-tile";
import { StatusPill } from "@/components/ui/status-pill";
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

interface PendingLoreAction {
  readonly action: StewardLoreAction;
  readonly claim: LoreClaimCard;
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
  const [isOnline, setIsOnline] = useState(true);
  const [pendingAction, setPendingAction] = useState<PendingLoreAction | null>(
    null,
  );
  const loreHref = `/leagues/${encodeURIComponent(data.league.id)}/lore`;
  const actionDisabled = busy !== null || !isOnline;

  useEffect(() => {
    setIsOnline(globalThis.navigator?.onLine ?? true);
    const markOnline = () => setIsOnline(true);
    const markOffline = () => setIsOnline(false);
    window.addEventListener("online", markOnline);
    window.addEventListener("offline", markOffline);
    return () => {
      window.removeEventListener("online", markOnline);
      window.removeEventListener("offline", markOffline);
    };
  }, []);

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

  async function confirmPendingAction() {
    const pending = pendingAction;
    if (!pending) {
      return;
    }
    setPendingAction(null);
    await applyAction(pending.claim, pending.action);
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-6 px-4 py-5 pb-[calc(--spacing(6)+env(safe-area-inset-bottom))] sm:px-6">
      <header className="panel grid gap-4 p-4">
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
            <p className="eyebrow text-primary">Lore / Steward review</p>
            <h1 className="heading-auspex mt-1 text-2xl leading-tight sm:text-3xl">
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

      <section className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Open votes" value={`${claims.length}`} />
        <StatTile
          label="Tiebreaks"
          tone={claims.some(needsTiebreak) ? "amber" : "default"}
          value={`${claims.filter(needsTiebreak).length}`}
        />
        <StatTile
          label="League"
          value={data.league.name.length > 10 ? "active" : data.league.name}
        />
      </section>

      {!isOnline ? (
        <Banner title="Lore steward console offline" tone="warn">
          Vote context stays visible. Ratify, reject, and extension actions are
          disabled until the connection returns.
        </Banner>
      ) : null}
      {message ? (
        <Banner title="Steward action recorded" tone="ok">
          {message}
        </Banner>
      ) : null}
      {error ? (
        <Banner title="Steward action failed" tone="danger">
          {error}
        </Banner>
      ) : null}

      {claims.length > 0 ? (
        <section className="grid gap-3" aria-label="Open lore votes">
          {claims.map((claim) => (
            <article key={claim.id} className="cell grid gap-4 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-base font-semibold tracking-tight">
                      <Link
                        href={`/leagues/${encodeURIComponent(data.league.id)}/lore/${encodeURIComponent(claim.id)}`}
                        className="hover:text-primary"
                      >
                        {claim.title}
                      </Link>
                    </h2>
                    {needsTiebreak(claim) ? (
                      <StatusPill tone="warning">
                        Quorum-short majority
                      </StatusPill>
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
                    <KVList
                      items={[
                        {
                          label: "Affirm",
                          tone: "positive",
                          value: claim.vote.tally.affirm,
                        },
                        {
                          label: "Reject",
                          tone: "negative",
                          value: claim.vote.tally.reject,
                        },
                        { label: "Abstain", value: claim.vote.tally.abstain },
                      ]}
                    />
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
                        className="min-h-20 rounded-control border border-input bg-[var(--panel-2)] px-3 py-2 text-sm outline-none focus-visible:shadow-[var(--focus-ring-shadow)]"
                        maxLength={500}
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={
                          actionDisabled ||
                          !(reasonByClaim[claim.id] ?? "").trim()
                        }
                        onClick={() =>
                          setPendingAction({ action: "ratify", claim })
                        }
                      >
                        <Check data-icon="inline-start" />
                        Ratify
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        disabled={
                          actionDisabled ||
                          !(reasonByClaim[claim.id] ?? "").trim()
                        }
                        onClick={() =>
                          setPendingAction({ action: "reject", claim })
                        }
                      >
                        <X data-icon="inline-start" />
                        Reject
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={
                          actionDisabled ||
                          !(reasonByClaim[claim.id] ?? "").trim()
                        }
                        onClick={() =>
                          setPendingAction({ action: "extend", claim })
                        }
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
        <EmptyState title="No lore votes need review">
          No open lore votes need steward review.
        </EmptyState>
      )}

      {pendingAction ? (
        <Dialog
          closeLabel="Cancel lore action"
          description="This writes an audited steward event using the reason entered on the claim."
          footer={
            <>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setPendingAction(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void confirmPendingAction()}
                loading={busy !== null}
              >
                Confirm action
              </Button>
            </>
          }
          onOpenChange={(nextOpen) => {
            if (!nextOpen) {
              setPendingAction(null);
            }
          }}
          open={true}
          title={`${pendingAction.action} "${pendingAction.claim.title}"`}
        >
          <p className="eyebrow text-warning">Confirm lore action</p>
        </Dialog>
      ) : null}
    </main>
  );
}
