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
import { useMemo, useState } from "react";
import {
  type OnboardingPanelError,
  onboardingPanelError,
  postJson,
} from "@/app/onboarding/client-http";
import { Button, buttonVariants } from "@/components/ui/button";
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

function statusClass(status: DataIntegrityReviewItem["status"]): string {
  switch (status) {
    case "fail":
      return "border-destructive/40 bg-destructive/10 text-destructive";
    case "reviewed":
      return "border-highlight/40 bg-highlight/10 text-highlight";
    case "pass":
      return "border-positive/40 bg-positive/10 text-positive";
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
  const [reran, setReran] = useState(false);
  const apiUrl = `/api/leagues/${league.id}/steward/integrity`;

  const unresolvedChecks = useMemo(
    () => checks.filter((check) => check.status === "fail"),
    [checks],
  );

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

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-6 px-4 py-5 pb-[calc(--spacing(6)+env(safe-area-inset-bottom))] sm:px-6">
      <header className="grid gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-primary">
              Members / Data review
            </p>
            <h1 className="mt-1 truncate text-xl font-semibold tracking-tight sm:text-2xl">
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
            onClick={() => void rerunIntegrity()}
            disabled={busyKey !== null}
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

      {error ? (
        <div className="rounded-card border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error.message}
        </div>
      ) : null}
      {reran ? (
        <div className="rounded-card border border-positive/40 bg-positive/10 px-3 py-2 text-sm text-positive">
          Integrity checks were rerun.
        </div>
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
            <h2 className="text-lg font-semibold tracking-tight">
              Ambiguous identities
            </h2>
          </div>
          <UserCheck className="size-5 text-primary" aria-hidden />
        </div>
        {suggestions.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {suggestions.map((suggestion) => (
              <article
                key={suggestion.mappingId}
                className="rounded-card border border-border bg-card p-4"
              >
                <div className="grid gap-1 text-sm">
                  <p className="font-semibold">
                    Team {suggestion.providerTeamId} · {suggestion.season}
                  </p>
                  <p className="text-muted-foreground">
                    Confidence {(suggestion.confidence * 100).toFixed(1)}%
                  </p>
                  <p className="break-all font-mono text-xs text-muted-foreground">
                    Person {suggestion.personId}
                  </p>
                </div>
                <Button
                  type="button"
                  className="mt-3"
                  variant="secondary"
                  onClick={() => void confirmSuggestion(suggestion)}
                  disabled={busyKey !== null}
                >
                  <Check data-icon="inline-start" />
                  Confirm link
                </Button>
              </article>
            ))}
          </div>
        ) : (
          <p className="rounded-card border border-dashed border-border bg-muted/25 px-3 py-3 text-sm text-muted-foreground">
            No fuzzy identity links are waiting for steward confirmation.
          </p>
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
            <h2 className="text-lg font-semibold tracking-tight">
              Integrity flags
            </h2>
          </div>
          <AlertTriangle className="size-5 text-highlight" aria-hidden />
        </div>
        {checks.length > 0 ? (
          <div className="grid gap-3">
            {checks.map((check) => (
              <article
                key={check.id}
                className="rounded-card border border-border bg-card p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold">
                      {checkLabel(check.checkKey)}
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {check.season ? `Season ${check.season} · ` : ""}
                      {new Date(check.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "rounded-control border px-2 py-1 text-xs font-medium",
                      statusClass(check.status),
                    )}
                  >
                    {check.status}
                  </span>
                </div>
                <p className="mt-3 max-h-24 overflow-auto break-words rounded-control border border-border bg-background px-3 py-2 font-mono text-xs text-muted-foreground">
                  {detailPreview(check.detail)}
                </p>
                {check.status === "fail" ? (
                  <Button
                    type="button"
                    className="mt-3"
                    variant="secondary"
                    onClick={() => void markReviewed(check)}
                    disabled={busyKey !== null}
                  >
                    <Check data-icon="inline-start" />
                    Mark reviewed
                  </Button>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <p className="rounded-card border border-dashed border-border bg-muted/25 px-3 py-3 text-sm text-muted-foreground">
            No integrity checks have been recorded yet.
          </p>
        )}
        {unresolvedChecks.length === 0 && checks.length > 0 ? (
          <p className="rounded-control border border-positive/30 bg-positive/10 px-3 py-2 text-sm text-positive">
            All recorded integrity checks are passing or reviewed.
          </p>
        ) : null}
      </section>
    </main>
  );
}
