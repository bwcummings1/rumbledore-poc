"use client";

import {
  AlertTriangle,
  ArrowLeft,
  CalendarCheck,
  Check,
  Crown,
  Database,
  Edit3,
  ListFilter,
  RadioTower,
  RefreshCcw,
  Save,
  ScrollText,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import Link from "next/link";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  getJson,
  type OnboardingPanelError,
  onboardingPanelError,
  postJson,
} from "@/app/onboarding/client-http";
import { EditLedgerFeed } from "@/components/curation/edit-ledger-feed";
import { Banner } from "@/components/ui/banner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { KVList } from "@/components/ui/kv";
import { Select } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import { StatTile } from "@/components/ui/stat-tile";
import { StatusPill } from "@/components/ui/status-pill";
import { cn } from "@/lib/utils";
import type {
  DataIntegrityReviewItem,
  DataStewardReviewSummary,
  SuggestedIdentityLink,
  UnifiedLedgerEntry,
} from "@/stats";
import type {
  CurationMatchupSpan,
  CurationPerson,
  CurationTeamSeason,
  DataCurationSummary,
} from "./curation-data";

interface DataStewardReviewViewProps {
  curation?: DataCurationSummary;
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

type LedgerFilter = {
  targetId?: string;
  targetKind?: UnifiedLedgerEntry["targetKind"];
};

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

function splitOwnerNames(value: string): string[] {
  return [...new Set(value.split(",").map((entry) => entry.trim()))].filter(
    Boolean,
  );
}

function seasonsLabel(seasons: readonly number[]): string {
  return seasons.length > 0 ? seasons.join(", ") : "No seasons";
}

function entityOptions(curation: DataCurationSummary) {
  return [
    { label: "Full league ledger", value: "" },
    ...curation.persons.map((person) => ({
      label: `Person · ${person.canonicalName}`,
      value: `person:${person.id}`,
    })),
    ...curation.teamSeasons.map((team) => ({
      label: `Team · ${team.season} ${team.teamName}`,
      value: `team_season:${team.id}`,
    })),
    ...curation.groupings.map((grouping) => ({
      label: `Grouping · ${grouping.name}`,
      value: `grouping:${grouping.id}`,
    })),
    ...curation.commissionerCandidates.map((candidate) => ({
      label: `Member · ${candidate.displayName}`,
      value: `member:${candidate.memberId}`,
    })),
  ];
}

function parseLedgerFilter(value: string): LedgerFilter {
  const [targetKind, targetId] = value.split(":");
  if (!targetKind || !targetId) {
    return {};
  }
  return { targetId, targetKind };
}

function ledgerUrl(leagueId: string, filter: LedgerFilter): string {
  const params = new URLSearchParams({ limit: "100" });
  if (filter.targetKind && filter.targetId) {
    params.set("targetKind", filter.targetKind);
    params.set("targetId", filter.targetId);
  }
  return `/api/leagues/${leagueId}/curation/ledger?${params.toString()}`;
}

function personSeasonText(person: CurationPerson): string {
  return person.seasons.length > 0 ? seasonsLabel(person.seasons) : "Unmapped";
}

function matchupLabel(matchup: CurationMatchupSpan): string {
  return `${matchup.season} W${matchup.scoringPeriod} · ${matchup.homeTeamName} ${matchup.homeScore} / ${matchup.awayTeamName} ${matchup.awayScore}`;
}

export function DataStewardReviewView({
  curation,
  initialSummary,
  league,
}: DataStewardReviewViewProps) {
  const [checks, setChecks] = useState(initialSummary.integrityChecks);
  const driftAlerts = initialSummary.payloadDriftAlerts;
  const [suggestions, setSuggestions] = useState(
    initialSummary.suggestedIdentityLinks,
  );
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<OnboardingPanelError | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [pendingAction, setPendingAction] =
    useState<PendingStewardAction | null>(null);
  const [reran, setReran] = useState(false);
  const [curationState, setCurationState] = useState(curation ?? null);
  const [ledgerEntries, setLedgerEntries] = useState(curation?.ledger ?? []);
  const [ledgerFilterValue, setLedgerFilterValue] = useState("");
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const apiUrl = `/api/leagues/${league.id}/steward/integrity`;
  const editApiUrl = `/api/leagues/${league.id}/curation/edits`;
  const groupingApiUrl = `/api/leagues/${league.id}/curation/groupings`;
  const handoffApiUrl = `/api/leagues/${league.id}/commissioner/handoff`;

  const unresolvedChecks = useMemo(
    () => checks.filter((check) => check.status === "fail"),
    [checks],
  );
  const unresolvedGroupings = useMemo(
    () =>
      (curationState?.groupings ?? []).filter(
        (grouping) => grouping.status === "proposed",
      ),
    [curationState],
  );
  const visibleLedgerOptions = useMemo(
    () => (curationState ? entityOptions(curationState) : []),
    [curationState],
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
    setSuccessMessage(null);
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

  async function refreshLedger(filterValue = ledgerFilterValue) {
    const filter = parseLedgerFilter(filterValue);
    const payload = await getJson<{ entries: UnifiedLedgerEntry[] }>(
      ledgerUrl(league.id, filter),
    );
    setLedgerEntries(payload.entries);
  }

  async function submitPersonName(
    event: FormEvent<HTMLFormElement>,
    person: CurationPerson,
  ) {
    event.preventDefault();
    if (!curationState) {
      return;
    }
    const form = new FormData(event.currentTarget);
    const canonicalName = String(form.get("canonicalName") ?? "").trim();
    const reason = String(form.get("reason") ?? "").trim();
    if (!canonicalName || canonicalName === person.canonicalName) {
      return;
    }
    setBusyKey(`person:${person.id}`);
    setError(null);
    setSuccessMessage(null);
    try {
      await postJson(editApiUrl, {
        editClass: "cosmetic",
        field: "canonical_name",
        reason: reason || "Corrected person display name",
        targetId: person.id,
        targetKind: "person",
        value: canonicalName,
      });
      setCurationState({
        ...curationState,
        persons: curationState.persons.map((candidate) =>
          candidate.id === person.id
            ? { ...candidate, canonicalName }
            : candidate,
        ),
      });
      await refreshLedger();
      setSuccessMessage("Person name was recorded.");
    } catch (cause) {
      setError(onboardingPanelError(cause));
    } finally {
      setBusyKey(null);
    }
  }

  async function submitTeamSeasonEdit(
    event: FormEvent<HTMLFormElement>,
    team: CurationTeamSeason,
    field: "owner_names" | "team_name",
  ) {
    event.preventDefault();
    if (!curationState) {
      return;
    }
    const form = new FormData(event.currentTarget);
    const rawValue = String(form.get(field) ?? "").trim();
    const reason = String(form.get("reason") ?? "").trim();
    const value =
      field === "owner_names" ? splitOwnerNames(rawValue) : rawValue;
    if (
      (Array.isArray(value) && value.length === 0) ||
      (!Array.isArray(value) && !value)
    ) {
      return;
    }
    setBusyKey(`team:${team.id}:${field}`);
    setError(null);
    setSuccessMessage(null);
    try {
      await postJson(editApiUrl, {
        editClass: "cosmetic",
        field,
        reason: reason || "Corrected team-season fixed variable",
        targetId: team.id,
        targetKind: "team_season",
        value,
      });
      setCurationState({
        ...curationState,
        teamSeasons: curationState.teamSeasons.map((candidate) =>
          candidate.id === team.id
            ? {
                ...candidate,
                ...(field === "team_name"
                  ? { teamName: value as string }
                  : { ownerNames: value as string[] }),
              }
            : candidate,
        ),
      });
      await refreshLedger();
      setSuccessMessage("Team-season edit was recorded.");
    } catch (cause) {
      setError(onboardingPanelError(cause));
    } finally {
      setBusyKey(null);
    }
  }

  async function submitMatchupSpan(
    event: FormEvent<HTMLFormElement>,
    matchup: CurationMatchupSpan,
  ) {
    event.preventDefault();
    if (!curationState) {
      return;
    }
    const form = new FormData(event.currentTarget);
    const value = Number(form.get("scoring_period_span"));
    const reason = String(form.get("reason") ?? "").trim();
    if (!Number.isInteger(value) || value < 1) {
      setError({ message: "Span must be a positive integer." });
      return;
    }
    setBusyKey(`matchup:${matchup.id}`);
    setError(null);
    setSuccessMessage(null);
    try {
      await postJson(editApiUrl, {
        editClass: "substantive",
        field: "scoring_period_span",
        reason: reason || "Corrected matchup scoring-period span",
        targetId: matchup.id,
        targetKind: "matchup",
        value,
      });
      setCurationState({
        ...curationState,
        matchupSpans: curationState.matchupSpans.map((candidate) =>
          candidate.id === matchup.id
            ? { ...candidate, scoringPeriodSpan: value }
            : candidate,
        ),
      });
      await refreshLedger();
      setSuccessMessage("Matchup span edit was recorded.");
    } catch (cause) {
      setError(onboardingPanelError(cause));
    } finally {
      setBusyKey(null);
    }
  }

  async function submitGroupingConfirm(
    event: FormEvent<HTMLFormElement>,
    groupingId: string,
  ) {
    event.preventDefault();
    if (!curationState) {
      return;
    }
    const form = new FormData(event.currentTarget);
    const seasons = String(form.get("seasons") ?? "")
      .split(",")
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isInteger(value));
    const name = String(form.get("name") ?? "").trim();
    const reason = String(form.get("reason") ?? "").trim();
    if (seasons.length === 0) {
      setError({ message: "At least one season is required." });
      return;
    }
    setBusyKey(`grouping:${groupingId}`);
    setError(null);
    setSuccessMessage(null);
    try {
      const payload = await postJson<{
        grouping: DataCurationSummary["groupings"][number];
      }>(groupingApiUrl, {
        action: "confirm",
        groupingId,
        name,
        reason: reason || "Confirmed season grouping",
        seasons,
      });
      setCurationState({
        ...curationState,
        groupings: curationState.groupings.map((candidate) =>
          candidate.id === groupingId ? payload.grouping : candidate,
        ),
      });
      await refreshLedger();
      setSuccessMessage("Season grouping was confirmed.");
    } catch (cause) {
      setError(onboardingPanelError(cause));
    } finally {
      setBusyKey(null);
    }
  }

  async function submitCommissionerHandoff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!curationState) {
      return;
    }
    const form = new FormData(event.currentTarget);
    const targetMemberId = String(form.get("targetMemberId") ?? "");
    const reason = String(form.get("reason") ?? "").trim();
    if (!targetMemberId) {
      return;
    }
    setBusyKey("commissioner-handoff");
    setError(null);
    setSuccessMessage(null);
    try {
      await postJson(handoffApiUrl, {
        reason: reason || "Commissioner handoff",
        targetMemberId,
      });
      setCurationState({
        ...curationState,
        access: {
          ...curationState.access,
          canConfirmGroupings: false,
          canEditData: false,
          canHandoffCommissioner: false,
          role: "member",
        },
        commissionerCandidates: [],
      });
      await refreshLedger();
      setSuccessMessage("Commissioner handoff was recorded.");
    } catch (cause) {
      setError(onboardingPanelError(cause));
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
            <h1 className="heading-auspex mt-1 truncate text-xl leading-tight">
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
          {!curationState || curationState.access.canEditData ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => setPendingAction({ kind: "rerun_integrity" })}
              disabled={actionDisabled}
            >
              <RefreshCcw data-icon="inline-start" />
              Rerun checks
            </Button>
          ) : null}
          {curationState ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setLedgerOpen(true)}
            >
              <ScrollText data-icon="inline-start" />
              Open public ledger
            </Button>
          ) : null}
          <Link
            href={`/leagues/${league.id}/members`}
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            <ArrowLeft data-icon="inline-start" />
            Members
          </Link>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-4">
        <StatTile
          label="Open flags"
          tone={unresolvedChecks.length > 0 ? "amber" : "default"}
          value={`${unresolvedChecks.length}`}
        />
        <StatTile
          label="Identity suggestions"
          value={`${suggestions.length}`}
        />
        <StatTile
          label="Drift alerts"
          tone={driftAlerts.length > 0 ? "amber" : "default"}
          value={`${driftAlerts.length}`}
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
      {successMessage ? (
        <Banner title="Ledger updated" tone="ok">
          {successMessage}
        </Banner>
      ) : null}

      {curationState ? (
        <>
          <section className="grid gap-3 sm:grid-cols-4">
            <StatTile
              label="Ledger entries"
              tone={ledgerEntries.length > 0 ? "amber" : "default"}
              value={`${ledgerEntries.length}`}
            />
            <StatTile
              label="Fixed variables"
              value={`${curationState.persons.length + curationState.teamSeasons.length}`}
            />
            <StatTile
              label="Era proposals"
              tone={unresolvedGroupings.length > 0 ? "amber" : "default"}
              value={`${unresolvedGroupings.length}`}
            />
            <StatTile
              label="Authority"
              value={curationState.access.role.replaceAll("_", " ")}
            />
          </section>

          <section className="panel grid gap-4 p-4" id="public-ledger">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="eyebrow text-primary">Public ledger</p>
                <h2 className="heading-auspex mt-1 text-lg">
                  Transparent edits
                </h2>
              </div>
              <Database className="size-5 text-primary" aria-hidden />
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
              <Field controlId="ledger-filter" label="Entity filter">
                <Select
                  options={visibleLedgerOptions}
                  value={ledgerFilterValue}
                  onValueChange={(value) => {
                    setLedgerFilterValue(value);
                    void refreshLedger(value).catch((cause) =>
                      setError(onboardingPanelError(cause)),
                    );
                  }}
                />
              </Field>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setLedgerOpen(true)}
              >
                <ListFilter data-icon="inline-start" />
                Inspect
              </Button>
            </div>
            <EditLedgerFeed
              emptyBody="This league has no recorded data edits yet."
              emptyTitle="No ledger entries"
              entries={ledgerEntries}
              maxEntries={3}
            />
          </section>

          {curationState?.access.canEditData ? (
            <section
              aria-label="Fixed variable edits"
              className="grid gap-3"
              id="fixed-variables"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="eyebrow text-primary">Fixed variables</p>
                  <h2 className="heading-auspex text-lg">Names and owners</h2>
                </div>
                <Edit3 className="size-5 text-primary" aria-hidden />
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                {curationState.persons.map((person) => (
                  <form
                    className="cell grid gap-3 p-4"
                    key={`${person.id}:${person.canonicalName}`}
                    onSubmit={(event) => void submitPersonName(event, person)}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-display text-sm font-medium">
                          {person.canonicalName}
                        </p>
                        <p className="mt-1 font-mono text-xs text-muted-foreground">
                          Seasons {personSeasonText(person)}
                        </p>
                      </div>
                      <StatusPill tone="neutral">cosmetic</StatusPill>
                    </div>
                    <Field
                      controlId={`person-${person.id}-name`}
                      label="Canonical name"
                    >
                      <Input
                        defaultValue={person.canonicalName}
                        name="canonicalName"
                      />
                    </Field>
                    <Field
                      controlId={`person-${person.id}-reason`}
                      label="Reason"
                    >
                      <Input name="reason" placeholder="Name formatting" />
                    </Field>
                    <Button
                      type="submit"
                      variant="secondary"
                      disabled={actionDisabled}
                      loading={busyKey === `person:${person.id}`}
                    >
                      <Save data-icon="inline-start" />
                      Save name
                    </Button>
                  </form>
                ))}
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                {curationState.teamSeasons.map((team) => (
                  <article className="cell grid gap-3 p-4" key={team.id}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-display text-sm font-medium">
                          {team.season} · {team.teamName}
                        </p>
                        <p className="mt-1 font-mono text-xs text-muted-foreground">
                          {team.personName ?? "Unmapped"} · Provider team{" "}
                          {team.providerTeamId}
                        </p>
                      </div>
                      <StatusPill tone="neutral">cosmetic</StatusPill>
                    </div>
                    <form
                      className="grid gap-2"
                      onSubmit={(event) =>
                        void submitTeamSeasonEdit(event, team, "team_name")
                      }
                    >
                      <Field
                        controlId={`team-${team.id}-name`}
                        label="Team name"
                      >
                        <Input defaultValue={team.teamName} name="team_name" />
                      </Field>
                      <Field
                        controlId={`team-${team.id}-name-reason`}
                        label="Reason"
                      >
                        <Input name="reason" placeholder="Provider spelling" />
                      </Field>
                      <Button
                        type="submit"
                        variant="secondary"
                        disabled={actionDisabled}
                        loading={busyKey === `team:${team.id}:team_name`}
                      >
                        <Save data-icon="inline-start" />
                        Save team
                      </Button>
                    </form>
                    <form
                      className="grid gap-2"
                      onSubmit={(event) =>
                        void submitTeamSeasonEdit(event, team, "owner_names")
                      }
                    >
                      <Field
                        controlId={`team-${team.id}-owners`}
                        label="Owners"
                      >
                        <Input
                          defaultValue={team.ownerNames.join(", ")}
                          name="owner_names"
                        />
                      </Field>
                      <Field
                        controlId={`team-${team.id}-owner-reason`}
                        label="Reason"
                      >
                        <Input name="reason" placeholder="Owner spelling" />
                      </Field>
                      <Button
                        type="submit"
                        variant="secondary"
                        disabled={actionDisabled}
                        loading={busyKey === `team:${team.id}:owner_names`}
                      >
                        <Save data-icon="inline-start" />
                        Save owners
                      </Button>
                    </form>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {curationState?.access.canEditData ? (
            <section
              aria-label="Structural matchup span edits"
              className="grid gap-3"
              id="matchup-spans"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="eyebrow text-warning">Substantive</p>
                  <h2 className="heading-auspex text-lg">Matchup spans</h2>
                </div>
                <CalendarCheck className="size-5 text-highlight" aria-hidden />
              </div>
              {curationState.matchupSpans.length > 0 ? (
                <div className="grid gap-3 lg:grid-cols-2">
                  {curationState.matchupSpans.slice(0, 8).map((matchup) => (
                    <form
                      className="cell grid gap-3 p-4"
                      key={matchup.id}
                      onSubmit={(event) =>
                        void submitMatchupSpan(event, matchup)
                      }
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="font-display text-sm font-medium">
                          {matchupLabel(matchup)}
                        </p>
                        <StatusPill tone="warning">substantive</StatusPill>
                      </div>
                      <KVList
                        items={[
                          {
                            label: "Settings span",
                            value: matchup.matchupPeriodCount,
                          },
                          {
                            label: "Current span",
                            value: matchup.scoringPeriodSpan,
                          },
                          {
                            label: "Period start",
                            value: matchup.periodStart ?? "unset",
                          },
                        ]}
                      />
                      <Field
                        controlId={`matchup-${matchup.id}-span`}
                        label="Scoring-period span"
                      >
                        <Input
                          defaultValue={String(matchup.scoringPeriodSpan)}
                          min={1}
                          name="scoring_period_span"
                          type="number"
                        />
                      </Field>
                      <Field
                        controlId={`matchup-${matchup.id}-reason`}
                        label="Reason"
                      >
                        <Input name="reason" placeholder="Two-week final" />
                      </Field>
                      <Button
                        type="submit"
                        variant="secondary"
                        disabled={actionDisabled}
                        loading={busyKey === `matchup:${matchup.id}`}
                      >
                        <Save data-icon="inline-start" />
                        Save span
                      </Button>
                    </form>
                  ))}
                </div>
              ) : (
                <EmptyState title="No matchup spans">
                  No matchup rows are available for structural review.
                </EmptyState>
              )}
            </section>
          ) : null}

          {curationState.access.canConfirmGroupings ? (
            <section
              aria-label="Era confirmations"
              className="grid gap-3"
              id="era-confirm"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="eyebrow text-primary">Era lens</p>
                  <h2 className="heading-auspex text-lg">Season groupings</h2>
                </div>
                <CalendarCheck className="size-5 text-primary" aria-hidden />
              </div>
              {curationState.groupings.length > 0 ? (
                <div className="grid gap-3 lg:grid-cols-2">
                  {curationState.groupings.map((grouping) => (
                    <form
                      className="cell grid gap-3 p-4"
                      key={`${grouping.id}:${grouping.name}:${grouping.seasons.join("-")}`}
                      onSubmit={(event) =>
                        void submitGroupingConfirm(event, grouping.id)
                      }
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-display text-sm font-medium">
                            {grouping.name}
                          </p>
                          <p className="mt-1 font-mono text-xs text-muted-foreground">
                            {seasonsLabel(grouping.seasons)}
                          </p>
                        </div>
                        <StatusPill
                          tone={
                            grouping.status === "confirmed"
                              ? "success"
                              : "warning"
                          }
                        >
                          {grouping.status}
                        </StatusPill>
                      </div>
                      <Field
                        controlId={`grouping-${grouping.id}-name`}
                        label="Grouping name"
                      >
                        <Input defaultValue={grouping.name} name="name" />
                      </Field>
                      <Field
                        controlId={`grouping-${grouping.id}-seasons`}
                        label="Seasons"
                      >
                        <Input
                          defaultValue={grouping.seasons.join(", ")}
                          name="seasons"
                        />
                      </Field>
                      <Field
                        controlId={`grouping-${grouping.id}-reason`}
                        label="Reason"
                      >
                        <Input name="reason" placeholder="Confirmed era" />
                      </Field>
                      <Button
                        type="submit"
                        variant="secondary"
                        disabled={actionDisabled}
                        loading={busyKey === `grouping:${grouping.id}`}
                      >
                        <Check data-icon="inline-start" />
                        Confirm grouping
                      </Button>
                    </form>
                  ))}
                </div>
              ) : (
                <EmptyState title="No grouping proposals">
                  Cumulative records remain the active lens.
                </EmptyState>
              )}
            </section>
          ) : null}

          {curationState.access.canHandoffCommissioner ? (
            <section className="panel grid gap-4 p-4" id="commissioner-handoff">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="eyebrow text-warning">Commissioner</p>
                  <h2 className="heading-auspex mt-1 text-lg">
                    Authority handoff
                  </h2>
                </div>
                <Crown className="size-5 text-highlight" aria-hidden />
              </div>
              {curationState.commissionerCandidates.length > 0 ? (
                <form
                  className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
                  onSubmit={(event) => void submitCommissionerHandoff(event)}
                >
                  <Field controlId="handoff-target" label="New commissioner">
                    <Select
                      name="targetMemberId"
                      options={curationState.commissionerCandidates.map(
                        (candidate) => ({
                          label: `${candidate.displayName} · ${candidate.role.replaceAll("_", " ")}`,
                          value: candidate.memberId,
                        }),
                      )}
                    />
                  </Field>
                  <Field controlId="handoff-reason" label="Reason">
                    <Input name="reason" placeholder="Commissioner handoff" />
                  </Field>
                  <Button
                    className="self-end"
                    type="submit"
                    variant="secondary"
                    disabled={actionDisabled}
                    loading={busyKey === "commissioner-handoff"}
                  >
                    <Crown data-icon="inline-start" />
                    Hand off
                  </Button>
                </form>
              ) : (
                <EmptyState title="No handoff candidates">
                  No eligible member is available for handoff.
                </EmptyState>
              )}
            </section>
          ) : null}

          <Sheet
            closeLabel="Close public ledger"
            description="League-visible data edit history"
            onOpenChange={setLedgerOpen}
            open={ledgerOpen}
            title="Public Data Ledger"
          >
            <EditLedgerFeed
              emptyBody="This league has no recorded data edits yet."
              emptyTitle="No ledger entries"
              entries={ledgerEntries}
            />
          </Sheet>
        </>
      ) : null}

      {!curationState || curationState.access.canEditData ? (
        <>
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

          {curationState?.access.canEditData ? (
            <section
              id="provider-drift-review"
              aria-label="Provider drift alerts"
              className="panel grid gap-4 p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="eyebrow text-highlight">Provider canaries</p>
                  <h2 className="heading-auspex text-lg">Payload drift</h2>
                </div>
                <RadioTower className="size-5 text-highlight" aria-hidden />
              </div>
              {driftAlerts.length > 0 ? (
                <div className="grid gap-3 lg:grid-cols-2">
                  {driftAlerts.map((alert) => (
                    <article key={alert.id} className="cell grid gap-3 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="font-display text-base font-medium capitalize">
                            {alert.view} canary
                          </h3>
                          <p className="mt-1 font-mono text-xs text-muted-foreground">
                            {alert.provider.toUpperCase()} · {alert.season}
                            {alert.scoringPeriod
                              ? ` · Week ${alert.scoringPeriod}`
                              : ""}
                          </p>
                        </div>
                        <StatusPill tone="danger">drift</StatusPill>
                      </div>
                      <KVList
                        items={[
                          {
                            label: "Detected",
                            value: new Date(alert.observedAt).toLocaleString(),
                          },
                          {
                            label: "Signal",
                            value: alert.driftKinds
                              .map((kind) => kind.replaceAll("_", " "))
                              .join(" + "),
                          },
                          {
                            label: "Content hash",
                            value: (
                              <span className="font-mono text-xs">
                                {alert.contentHash.slice(0, 16)}
                              </span>
                            ),
                          },
                        ]}
                      />
                      {alert.addedPaths.length > 0 ||
                      alert.removedPaths.length > 0 ? (
                        <p className="max-h-24 overflow-auto break-words rounded-control border border-border bg-background px-3 py-2 font-mono text-xs text-muted-foreground">
                          {alert.addedPaths.length > 0
                            ? `Added: ${alert.addedPaths.join(", ")}`
                            : ""}
                          {alert.addedPaths.length > 0 &&
                          alert.removedPaths.length > 0
                            ? " · "
                            : ""}
                          {alert.removedPaths.length > 0
                            ? `Removed: ${alert.removedPaths.join(", ")}`
                            : ""}
                        </p>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : (
                <Banner title="No active drift alerts" tone="ok">
                  Stable canaries and first-run baselines stay quiet; any
                  normalized settings or scoreboard drift will appear here.
                </Banner>
              )}
            </section>
          ) : null}

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
        </>
      ) : null}

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
