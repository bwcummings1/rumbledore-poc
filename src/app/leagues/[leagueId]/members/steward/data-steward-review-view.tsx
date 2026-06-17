"use client";

import {
  AlertTriangle,
  ArrowLeft,
  Check,
  RefreshCcw,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  type OnboardingPanelError,
  onboardingPanelError,
  postJson,
} from "@/app/onboarding/client-http";
import { Banner } from "@/components/ui/banner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { KVList } from "@/components/ui/kv";
import { StatTile } from "@/components/ui/stat-tile";
import { StatusPill } from "@/components/ui/status-pill";
import { cn } from "@/lib/utils";
import type {
  DataIntegrityReviewItem,
  DataStewardReviewSummary,
  SuggestedIdentityLink,
} from "@/stats";

interface DataStewardReviewViewProps {
  initialSummary: DataStewardReviewSummary;
  league: {
    id: string;
    name: string;
  };
}

type PendingStewardAction =
  | { check: DataIntegrityReviewItem; kind: "mark_reviewed" }
  | { kind: "rerun_integrity" }
  | { kind: "suggestion"; suggestion: SuggestedIdentityLink };

function checkLabel(key: DataIntegrityReviewItem["checkKey"]): string {
  switch (key) {
    case "identity_sanity":
      return "Identity sanity";
    case "no_silent_empty":
      return "No silent empty";
    case "reconciliation_totals":
      return "Reconciliation totals";
    case "schedule_coverage":
      return "Schedule coverage";
    case "standings_parity":
      return "Standings parity";
  }
  return key.replaceAll("_", " ");
}

function statusTone(
  status: DataIntegrityReviewItem["status"],
): "danger" | "success" | "warning" {
  switch (status) {
    case "fail":
      return "danger";
    case "reviewed":
      return "warning";
    case "pass":
      return "success";
  }
}

function detailPreview(detail: Record<string, unknown>): string {
  const entries = Object.entries(detail);
  if (entries.length === 0) {
    return "No detail payload recorded.";
  }
  return JSON.stringify(detail);
}

export function DataStewardReviewView({
  initialSummary,
  league,
}: DataStewardReviewViewProps) {
  const [checks, setChecks] = useState(initialSummary.integrityChecks);
  const [suggestions, setSuggestions] = useState(
    initialSummary.suggestedIdentityLinks,
  );
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<OnboardingPanelError | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [pendingAction, setPendingAction] =
    useState<PendingStewardAction | null>(null);
  const [reran, setReran] = useState(false);
  const apiUrl = `/api/leagues/${league.id}/steward/integrity`;

  const unresolvedChecks = useMemo(
    () => checks.filter((check) => check.status === "fail"),
    [checks],
  );
  const actionDisabled = busyKey !== null || !isOnline;

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

  async function postAction(body: unknown, busy: string) {
    setBusyKey(busy);
    setError(null);
    setReran(false);
    try {
      await postJson<unknown>(apiUrl, body);
      return true;
    } catch (cause) {
      setError(onboardingPanelError(cause));
      return false;
    } finally {
      setBusyKey(null);
    }
  }

  async function markReviewed(check: DataIntegrityReviewItem) {
    const ok = await postAction(
      {
        action: "mark_reviewed",
        checkId: check.id,
        reason: "Accepted from steward review",
      },
      `check:${check.id}`,
    );
    if (!ok) {
      return;
    }
    const reviewedAt = new Date().toISOString();
    setChecks((current) =>
      current.map((candidate) =>
        candidate.id === check.id
          ? { ...candidate, reviewedAt, status: "reviewed" }
          : candidate,
      ),
    );
  }

  async function confirmSuggestion(suggestion: SuggestedIdentityLink) {
    const ok = await postAction(
      {
        action: "reassign_team_season",
        reason: "Confirmed suggested identity link from steward review",
        targetPersonId: suggestion.personId,
        teamSeasonId: suggestion.teamSeasonId,
      },
      `suggestion:${suggestion.mappingId}`,
    );
    if (!ok) {
      return;
    }
    setSuggestions((current) =>
      current.filter(
        (candidate) => candidate.mappingId !== suggestion.mappingId,
      ),
    );
  }

  async function rerunIntegrity() {
    const ok = await postAction(
      {
        action: "rerun_integrity",
        reason: "Steward requested a fresh integrity review",
      },
      "rerun",
    );
    setReran(ok);
  }

  async function confirmPendingAction() {
    const pending = pendingAction;
    if (!pending) {
      return;
    }
    setPendingAction(null);
    if (pending.kind === "suggestion") {
      await confirmSuggestion(pending.suggestion);
      return;
    }
    if (pending.kind === "mark_reviewed") {
      await markReviewed(pending.check);
      return;
    }
    await rerunIntegrity();
  }

  function pendingActionBody(action: PendingStewardAction): string {
    if (action.kind === "suggestion") {
      return `Confirm team ${action.suggestion.providerTeamId} (${action.suggestion.season}) as a manual identity link.`;
    }
    if (action.kind === "mark_reviewed") {
      return `Mark ${checkLabel(action.check.checkKey)} as reviewed for trusted record reads.`;
    }
    return "Rerun the integrity checks for this league.";
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-6 px-4 py-5 pb-[calc(--spacing(6)+env(safe-area-inset-bottom))] sm:px-6">
      <header className="panel grid gap-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="eyebrow text-primary">Members / Data review</p>
            <h1 className="heading-auspex mt-1 truncate text-2xl leading-tight sm:text-3xl">
              {league.name}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Review ambiguous identity links and integrity flags before the
              record book treats them as settled.
            </p>
          </div>
          <ShieldCheck className="size-6 text-primary" aria-hidden />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setPendingAction({ kind: "rerun_integrity" })}
            disabled={actionDisabled}
          >
            <RefreshCcw data-icon="inline-start" />
            Rerun checks
          </Button>
          <Link
            href={`/leagues/${league.id}/members`}
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            <ArrowLeft data-icon="inline-start" />
            Members
          </Link>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label="Open flags"
          tone={unresolvedChecks.length > 0 ? "amber" : "default"}
          value={`${unresolvedChecks.length}`}
        />
        <StatTile
          label="Identity suggestions"
          value={`${suggestions.length}`}
        />
        <StatTile label="Recorded checks" value={`${checks.length}`} />
      </section>

      {!isOnline ? (
        <Banner title="Steward console offline" tone="warn">
          Review data stays visible. Correction actions are disabled until the
          connection returns.
        </Banner>
      ) : null}
      {error ? (
        <Banner title="Steward action failed" tone="danger">
          {error.message}
        </Banner>
      ) : null}
      {reran ? (
        <Banner title="Integrity checks were rerun" tone="ok">
          Integrity checks were rerun.
        </Banner>
      ) : null}

      <section
        id="identity-review"
        aria-label="Suggested identity links"
        className="grid gap-3"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              Suggested-link band
            </p>
            <h2 className="heading-auspex text-lg">Ambiguous identities</h2>
          </div>
          <UserCheck className="size-5 text-primary" aria-hidden />
        </div>
        {suggestions.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {suggestions.map((suggestion) => (
              <article
                key={suggestion.mappingId}
                className="cell grid gap-3 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <p className="font-display text-sm font-medium">
                    Team {suggestion.providerTeamId} · {suggestion.season}
                  </p>
                  <StatusPill tone="warning">
                    {(suggestion.confidence * 100).toFixed(1)}%
                  </StatusPill>
                </div>
                <KVList
                  items={[
                    {
                      label: "Person",
                      value: (
                        <span className="break-all font-mono text-xs">
                          {suggestion.personId}
                        </span>
                      ),
                    },
                    {
                      label: "Team season",
                      value: (
                        <span className="break-all font-mono text-xs">
                          {suggestion.teamSeasonId}
                        </span>
                      ),
                    },
                  ]}
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    setPendingAction({ kind: "suggestion", suggestion })
                  }
                  disabled={actionDisabled}
                >
                  <Check data-icon="inline-start" />
                  Confirm link
                </Button>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState title="No ambiguous identities">
            No fuzzy identity links are waiting for steward confirmation.
          </EmptyState>
        )}
      </section>

      <section
        id="integrity-review"
        aria-label="Integrity flags"
        className="grid gap-3"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              Trusted substrate
            </p>
            <h2 className="heading-auspex text-lg">Integrity flags</h2>
          </div>
          <AlertTriangle className="size-5 text-highlight" aria-hidden />
        </div>
        {checks.length > 0 ? (
          <div className="grid gap-3">
            {checks.map((check) => (
              <article key={check.id} className="cell grid gap-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-display text-base font-medium">
                      {checkLabel(check.checkKey)}
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {check.season ? `Season ${check.season} · ` : ""}
                      {new Date(check.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <StatusPill tone={statusTone(check.status)}>
                    {check.status}
                  </StatusPill>
                </div>
                <p className="mt-3 max-h-24 overflow-auto break-words rounded-control border border-border bg-background px-3 py-2 font-mono text-xs text-muted-foreground">
                  {detailPreview(check.detail)}
                </p>
                {check.status === "fail" ? (
                  <Button
                    type="button"
                    className="mt-3"
                    variant="secondary"
                    onClick={() =>
                      setPendingAction({ kind: "mark_reviewed", check })
                    }
                    disabled={actionDisabled}
                  >
                    <Check data-icon="inline-start" />
                    Mark reviewed
                  </Button>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <EmptyState title="No integrity checks">
            No integrity checks have been recorded yet.
          </EmptyState>
        )}
        {unresolvedChecks.length === 0 && checks.length > 0 ? (
          <Banner title="Trusted substrate clear" tone="ok">
            All recorded integrity checks are passing or reviewed.
          </Banner>
        ) : null}
      </section>

      {pendingAction ? (
        <Dialog
          closeLabel="Cancel steward action"
          description={pendingActionBody(pendingAction)}
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
                loading={busyKey !== null}
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
          title="Write audited correction"
        >
          <p className="eyebrow text-warning">Confirm steward action</p>
        </Dialog>
      ) : null}
    </main>
  );
}
