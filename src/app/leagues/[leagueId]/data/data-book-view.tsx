"use client";

import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  Check,
  Database,
  Edit3,
  LockKeyhole,
  Radio,
  RotateCcw,
  Save,
  Upload,
  Users,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useId, useMemo, useState } from "react";
import { postJson } from "@/app/onboarding/client-http";
import {
  PublicationMasthead,
  type PublicationNavItem,
} from "@/components/publication/front-view";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { DataCardRow } from "@/components/ui/data-card-table";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusPill, type StatusTone } from "@/components/ui/status-pill";
import {
  DataTable,
  type DataTableColumn,
  SignedValue,
} from "@/components/ui/table";
import type {
  DataBookCheckpointOption,
  DataBookCurationMode,
  DataBookCurationState,
  DataBookGrain,
  DataBookPageData,
  DataBookPersonRow,
  DataBookSeason,
  DataBookSeasonCurationState,
  DataBookSettingRow,
  DataBookWeekRow,
} from "./data-book-data";

type CuratedEditScope = "all_years" | "this_year_only";

type EditableDimension =
  | {
      defaultReason: string;
      defaultScope: "all_years";
      field: "canonical_name";
      fieldLabel: "real name";
      season: number;
      targetId: string;
      targetKind: "person";
    }
  | {
      defaultReason: string;
      defaultScope: "this_year_only";
      field: "team_name";
      fieldLabel: "team name";
      season: number;
      targetId: string;
      targetKind: "team_season";
    };

interface PendingDimensionEdit {
  edit: EditableDimension;
  nextValue: string;
  previousValue: string;
}

interface CuratedEditResponse {
  affectedTargetIds?: string[];
  editIds?: string[];
  scope?: CuratedEditScope;
}

interface CheckpointMutationResponse {
  checkpoint: DataBookCheckpointOption;
}

interface CurationSeasonPushResponse {
  push?: DataBookSeasonPushSummary;
  pushes?: DataBookSeasonPushSummary[];
}

interface DataBookSeasonPushSummary {
  checkpointId: string | null;
  createdAt: string;
  id: string;
  season: number;
}

interface CurationSeasonModeResponse {
  state: {
    finalizedAt: string | null;
    finalizedByUserId: string | null;
    mode: DataBookCurationMode;
    reason: string | null;
    season: number;
  };
}

interface EditableCellRequest {
  edit: EditableDimension;
  nextValue: string;
  previousValue: string;
}

const grains: readonly {
  deck: string;
  label: string;
  value: DataBookGrain;
}[] = [
  {
    deck: "People, real names, and that season's team names.",
    label: "People",
    value: "people",
  },
  {
    deck: "Persisted season settings plus season totals.",
    label: "Settings",
    value: "settings",
  },
  {
    deck: "Team-week scores, opponents, results, byes, and spans.",
    label: "Weeks",
    value: "weeks",
  },
];

function formatNumber(value: number, digits = 2): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  }).format(value);
}

function formatTimestamp(value: string | null): string {
  if (!value) {
    return "never";
  }
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function shortId(value: string | null): string {
  return value ? value.slice(0, 8) : "-";
}

function resultTone(result: DataBookWeekRow["result"]): StatusTone {
  switch (result) {
    case "win":
      return "success";
    case "loss":
      return "danger";
    case "tie":
      return "warning";
    case "bye":
      return "info";
  }
}

function resultLabel(result: DataBookWeekRow["result"]): string {
  return result === "bye" ? "Bye" : result;
}

function seasonLabel(season: DataBookSeason): string {
  return `${season.season}`;
}

function selectedSeasonOrFallback(
  seasons: readonly DataBookSeason[],
  selectedSeason: number,
): DataBookSeason {
  return (
    seasons.find((season) => season.season === selectedSeason) ??
    seasons[0] ?? {
      people: [],
      season: selectedSeason,
      settings: [],
      summary: {
        byeFacts: 0,
        matchupFacts: 0,
        people: 0,
        seasonTotalPoints: 0,
        teamWeekFacts: 0,
        teams: 0,
      },
      weeks: [],
    }
  );
}

function scopeLabel(scope: CuratedEditScope): string {
  return scope === "all_years" ? "all-years" : "this-year-only";
}

function curationForSeason(
  curation: DataBookCurationState,
  season: number,
): DataBookSeasonCurationState {
  return (
    curation.seasons.find((entry) => entry.season === season) ?? {
      activeCheckpointId: curation.activeCheckpoint?.id ?? null,
      activeCheckpointLabel: curation.activeCheckpoint?.label ?? null,
      autoSuggestFinalize: false,
      finalizedAt: null,
      finalizedByUserId: null,
      hasSavedUnpushed: false,
      hasUnsavedDraft: curation.hasUnsavedDraft,
      isPushed: false,
      latestPushAt: null,
      latestPushCheckpointId: null,
      latestPushId: null,
      mode: "live",
      providerComplete: false,
      reason: null,
      season,
    }
  );
}

function checkpointLabel(checkpoint: DataBookCheckpointOption): string {
  const label =
    checkpoint.label?.trim() || `checkpoint ${shortId(checkpoint.id)}`;
  return `${label} / ${formatTimestamp(checkpoint.createdAt)}`;
}

function recomputeCurationSummary(
  state: DataBookCurationState,
): DataBookCurationState {
  return {
    ...state,
    hasSavedUnpushed: state.seasons.some((season) => season.hasSavedUnpushed),
    pushedSeasons: state.seasons.filter((season) => season.isPushed).length,
    totalSeasons: state.seasons.length,
  };
}

function markCheckpointActive(
  state: DataBookCurationState,
  checkpoint: DataBookCheckpointOption,
): DataBookCurationState {
  const checkpoints = [
    checkpoint,
    ...state.checkpoints.filter((entry) => entry.id !== checkpoint.id),
  ];
  const next = {
    ...state,
    activeCheckpoint: checkpoint,
    checkpoints,
    hasUnsavedDraft: false,
    seasons: state.seasons.map((season) => {
      const checkpointCoversSeason = checkpoint.seasons.includes(season.season);
      const pushedFromCheckpoint =
        season.latestPushCheckpointId === checkpoint.id;
      return {
        ...season,
        activeCheckpointId: checkpoint.id,
        activeCheckpointLabel: checkpoint.label,
        hasSavedUnpushed: checkpointCoversSeason && !pushedFromCheckpoint,
        hasUnsavedDraft: false,
        isPushed: season.latestPushId !== null,
      };
    }),
  };
  return recomputeCurationSummary(next);
}

function markSeasonPushed(
  state: DataBookCurationState,
  push: DataBookSeasonPushSummary,
): DataBookCurationState {
  const next = {
    ...state,
    seasons: state.seasons.map((season) =>
      season.season === push.season
        ? {
            ...season,
            hasSavedUnpushed: false,
            isPushed: true,
            latestPushAt: push.createdAt,
            latestPushCheckpointId: push.checkpointId,
            latestPushId: push.id,
          }
        : season,
    ),
  };
  return recomputeCurationSummary(next);
}

function markPushes(
  state: DataBookCurationState,
  pushes: readonly DataBookSeasonPushSummary[],
): DataBookCurationState {
  return pushes.reduce(
    (current, push) => markSeasonPushed(current, push),
    state,
  );
}

function markSeasonMode(
  state: DataBookCurationState,
  response: CurationSeasonModeResponse["state"],
): DataBookCurationState {
  return {
    ...state,
    seasons: state.seasons.map((season) =>
      season.season === response.season
        ? {
            ...season,
            autoSuggestFinalize:
              season.providerComplete && response.mode === "live",
            finalizedAt: response.finalizedAt,
            finalizedByUserId: response.finalizedByUserId,
            mode: response.mode,
            reason: response.reason,
          }
        : season,
    ),
  };
}

function draftCellKey(
  targetKind: "person" | "team_season",
  targetId: string | null | undefined,
  field: "canonical_name" | "team_name",
): string | null {
  return targetId ? `${targetKind}:${targetId}:${field}` : null;
}

function isPersonEditForRow(
  row: DataBookPersonRow,
  season: number,
  edit: EditableDimension,
  scope: CuratedEditScope,
  affectedTargetIds: ReadonlySet<string>,
): boolean {
  if (edit.targetKind !== "person") {
    return false;
  }
  if (scope === "all_years") {
    return row.personId === edit.targetId;
  }
  return (
    season === edit.season &&
    (row.personId === edit.targetId || affectedTargetIds.has(row.teamSeasonId))
  );
}

function replacementPersonId(
  currentPersonId: string | null,
  editedTeamSeasonId: string | null,
  edit: EditableDimension,
  scope: CuratedEditScope,
  affectedTargetIds: readonly string[],
): string | null {
  if (edit.targetKind !== "person" || scope === "all_years") {
    return currentPersonId;
  }
  return (
    affectedTargetIds.find(
      (id) => id !== edit.targetId && id !== editedTeamSeasonId,
    ) ?? currentPersonId
  );
}

function teamTargetIds(
  edit: EditableDimension,
  response: CuratedEditResponse,
): ReadonlySet<string> {
  if (edit.targetKind !== "team_season") {
    return new Set();
  }
  const affected = response.affectedTargetIds?.length
    ? response.affectedTargetIds
    : [edit.targetId];
  return new Set(affected);
}

function applyLocalDimensionEdit(
  data: DataBookPageData,
  pending: PendingDimensionEdit,
  response: CuratedEditResponse,
): DataBookPageData {
  const scope = response.scope ?? pending.edit.defaultScope;
  const affectedTargetIds = response.affectedTargetIds ?? [];
  const affectedSet = new Set(affectedTargetIds);
  const affectedTeamIds = teamTargetIds(pending.edit, response);
  const nextValue = pending.nextValue;

  return {
    ...data,
    seasons: data.seasons.map((season) => ({
      ...season,
      people: season.people.map((row) => {
        if (
          isPersonEditForRow(
            row,
            season.season,
            pending.edit,
            scope,
            affectedSet,
          )
        ) {
          return {
            ...row,
            personId: replacementPersonId(
              row.personId,
              row.teamSeasonId,
              pending.edit,
              scope,
              affectedTargetIds,
            ),
            personName: nextValue,
          };
        }

        if (
          pending.edit.targetKind === "team_season" &&
          affectedTeamIds.has(row.teamSeasonId)
        ) {
          return { ...row, teamName: nextValue };
        }

        return row;
      }),
      weeks: season.weeks.map((row) => {
        let next = row;
        if (pending.edit.targetKind === "person") {
          const inScopedSeason =
            scope === "all_years" || season.season === pending.edit.season;
          const personHit =
            row.personId === pending.edit.targetId ||
            (inScopedSeason && affectedSet.has(row.teamSeasonId));
          const opponentHit =
            row.opponentPersonId === pending.edit.targetId ||
            (inScopedSeason &&
              row.opponentTeamSeasonId !== null &&
              affectedSet.has(row.opponentTeamSeasonId));

          if (inScopedSeason && personHit) {
            next = {
              ...next,
              managerName: nextValue,
              personId: replacementPersonId(
                row.personId,
                row.teamSeasonId,
                pending.edit,
                scope,
                affectedTargetIds,
              ),
            };
          }
          if (inScopedSeason && opponentHit) {
            next = {
              ...next,
              opponent: nextValue,
              opponentPersonId:
                replacementPersonId(
                  row.opponentPersonId,
                  row.opponentTeamSeasonId,
                  pending.edit,
                  scope,
                  affectedTargetIds,
                ) ?? next.opponentPersonId,
            };
          }
        }

        if (pending.edit.targetKind === "team_season") {
          if (affectedTeamIds.has(row.teamSeasonId)) {
            next = { ...next, teamName: nextValue };
          }
          if (
            row.opponentTeamSeasonId !== null &&
            affectedTeamIds.has(row.opponentTeamSeasonId)
          ) {
            next = { ...next, opponentTeamName: nextValue };
          }
        }

        return next;
      }),
    })),
  };
}

function draftKeysForEdit(
  edit: EditableDimension,
  response: CuratedEditResponse,
): string[] {
  if (edit.targetKind === "person") {
    return [edit.targetId, ...(response.affectedTargetIds ?? [])]
      .map((id) => draftCellKey("person", id, "canonical_name"))
      .filter((key): key is string => Boolean(key));
  }

  const ids = response.affectedTargetIds?.length
    ? response.affectedTargetIds
    : [edit.targetId];
  return ids
    .map((id) => draftCellKey("team_season", id, "team_name"))
    .filter((key): key is string => Boolean(key));
}

function SeasonControl({
  onSeasonChange,
  season,
  seasons,
}: {
  onSeasonChange: (season: number) => void;
  season: DataBookSeason;
  seasons: readonly DataBookSeason[];
}) {
  return (
    <div className="grid gap-2 sm:max-w-56">
      <label
        className="font-mono text-xs uppercase tracking-[0.14em] text-ink-3"
        htmlFor="data-book-season"
      >
        Season
      </label>
      <Select
        aria-label="Data Book season"
        disabled={seasons.length <= 1}
        id="data-book-season"
        onValueChange={(value) => onSeasonChange(Number(value))}
        options={seasons.map((option) => ({
          label: seasonLabel(option),
          value: String(option.season),
        }))}
        value={String(season.season)}
      />
    </div>
  );
}

function ModePill({ state }: { state: DataBookSeasonCurationState }) {
  if (state.mode === "finalized") {
    return (
      <StatusPill icon={<LockKeyhole />} tone="warning">
        Curate + push
      </StatusPill>
    );
  }
  return (
    <StatusPill icon={<Radio />} tone="live">
      Live stream
    </StatusPill>
  );
}

function SeasonCurationPills({
  state,
}: {
  state: DataBookSeasonCurationState;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <ModePill state={state} />
      {state.hasUnsavedDraft ? (
        <StatusPill icon={<AlertTriangle />} tone="warning">
          Unsaved draft
        </StatusPill>
      ) : null}
      {state.hasSavedUnpushed ? (
        <StatusPill icon={<Save />} tone="info">
          Saved not pushed
        </StatusPill>
      ) : null}
      {state.isPushed ? (
        <StatusPill icon={<Upload />} tone="success">
          Pushed canonical
        </StatusPill>
      ) : null}
      {!state.hasUnsavedDraft && !state.hasSavedUnpushed && !state.isPushed ? (
        <StatusPill showDot={false} tone="neutral">
          Not saved
        </StatusPill>
      ) : null}
    </div>
  );
}

function seasonCurationMessage(state: DataBookSeasonCurationState): string {
  if (state.mode === "live") {
    return state.autoSuggestFinalize
      ? "Provider data reports this season complete; mark it finalized when the owner is ready to curate and push."
      : "This season streams live from provider updates and is not locked behind curation push.";
  }
  if (state.hasUnsavedDraft) {
    return "Finalized season is locked to the last pushed snapshot; save the current draft before pushing.";
  }
  if (state.hasSavedUnpushed) {
    return "Finalized season has a saved draft that is not visible to the Record Book until pushed.";
  }
  if (state.isPushed) {
    return "Finalized season has a pushed canonical snapshot ready for the Record Book boundary.";
  }
  return "Finalized season is curate-and-push; save a checkpoint before pushing canonical data.";
}

function OverallCurationPills({
  curation,
}: {
  curation: DataBookCurationState;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <StatusPill tone={curation.hasUnsavedDraft ? "warning" : "neutral"}>
        Overall draft {curation.hasUnsavedDraft ? "unsaved" : "saved"}
      </StatusPill>
      <StatusPill tone={curation.hasSavedUnpushed ? "info" : "neutral"}>
        Overall saved {curation.hasSavedUnpushed ? "unpushed" : "clear"}
      </StatusPill>
      <StatusPill tone={curation.pushedSeasons > 0 ? "success" : "neutral"}>
        {curation.pushedSeasons}/{curation.totalSeasons} pushed
      </StatusPill>
    </div>
  );
}

type PushIntent =
  | { action: "push"; season: number }
  | { action: "pushAll"; season: null };

function CurationControls({
  busyAction,
  canEditData,
  curation,
  error,
  message,
  onOpenPushDialog,
  onRestore,
  onSave,
  onSeasonModeChange,
  restoreCheckpointId,
  selectedSeasonState,
  setRestoreCheckpointId,
}: {
  busyAction: string | null;
  canEditData: boolean;
  curation: DataBookCurationState;
  error: string | null;
  message: string | null;
  onOpenPushDialog: (intent: PushIntent) => void;
  onRestore: () => void;
  onSave: () => void;
  onSeasonModeChange: (mode: DataBookCurationMode) => void;
  restoreCheckpointId: string;
  selectedSeasonState: DataBookSeasonCurationState;
  setRestoreCheckpointId: (checkpointId: string) => void;
}) {
  const hasCheckpoints = curation.checkpoints.length > 0;
  const pushDisabled =
    busyAction !== null ||
    selectedSeasonState.hasUnsavedDraft ||
    !selectedSeasonState.activeCheckpointId ||
    selectedSeasonState.mode === "live";
  const pushAllDisabled =
    busyAction !== null ||
    curation.hasUnsavedDraft ||
    !curation.activeCheckpoint ||
    !curation.hasSavedUnpushed ||
    curation.seasons.some((season) => season.mode === "live");

  return (
    <div className="grid gap-3">
      <div className="cell grid gap-3 p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-xs uppercase tracking-[0.14em] text-ink-4">
              Save / push state
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {seasonCurationMessage(selectedSeasonState)}
            </p>
          </div>
          <SeasonCurationPills state={selectedSeasonState} />
        </div>
        <OverallCurationPills curation={curation} />
        <div className="grid gap-1 font-mono text-xs text-muted-foreground sm:grid-cols-3">
          <span>
            Active save:{" "}
            <span className="text-foreground">
              {curation.activeCheckpoint
                ? checkpointLabel(curation.activeCheckpoint)
                : "none"}
            </span>
          </span>
          <span>
            Selected push:{" "}
            <span className="text-foreground">
              {formatTimestamp(selectedSeasonState.latestPushAt)}
            </span>
          </span>
          <span>
            Push source:{" "}
            <span className="text-foreground">
              {shortId(selectedSeasonState.latestPushCheckpointId)}
            </span>
          </span>
        </div>
      </div>

      {selectedSeasonState.autoSuggestFinalize ? (
        <Alert tone="warn" title="Provider reports season complete">
          Mark the season finalized to switch it from live streaming into
          curate-and-push mode.
        </Alert>
      ) : null}
      {message ? <Alert tone="ok">{message}</Alert> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}

      {canEditData ? (
        <div className="grid gap-2 lg:grid-cols-[minmax(13rem,1fr)_auto_auto_auto_auto] lg:items-end">
          <div className="grid gap-2">
            <label
              className="font-mono text-xs uppercase tracking-[0.14em] text-ink-3"
              htmlFor="data-book-restore-checkpoint"
            >
              Restore checkpoint
            </label>
            <Select
              disabled={!hasCheckpoints || busyAction !== null}
              id="data-book-restore-checkpoint"
              onValueChange={setRestoreCheckpointId}
              options={
                hasCheckpoints
                  ? curation.checkpoints.map((checkpoint) => ({
                      label: checkpointLabel(checkpoint),
                      value: checkpoint.id,
                    }))
                  : [{ label: "No saved checkpoints", value: "" }]
              }
              value={restoreCheckpointId}
            />
          </div>
          <Button
            disabled={busyAction !== null}
            loading={busyAction === "save"}
            loadingLabel="Saving checkpoint"
            onClick={onSave}
            type="button"
            variant="steel"
          >
            <Save data-icon="inline-start" />
            Save
          </Button>
          <Button
            disabled={!hasCheckpoints || busyAction !== null}
            loading={busyAction === "restore"}
            loadingLabel="Restoring checkpoint"
            onClick={onRestore}
            type="button"
            variant="ghost"
          >
            <RotateCcw data-icon="inline-start" />
            Restore
          </Button>
          <Button
            disabled={pushDisabled}
            onClick={() =>
              onOpenPushDialog({
                action: "push",
                season: selectedSeasonState.season,
              })
            }
            type="button"
          >
            <Upload data-icon="inline-start" />
            Push {selectedSeasonState.season}
          </Button>
          <Button
            disabled={pushAllDisabled}
            onClick={() =>
              onOpenPushDialog({ action: "pushAll", season: null })
            }
            type="button"
            variant="amber"
          >
            <Upload data-icon="inline-start" />
            Push all
          </Button>
          <Button
            className="lg:col-start-2"
            disabled={busyAction !== null}
            loading={busyAction === "mode"}
            loadingLabel="Changing season mode"
            onClick={() =>
              onSeasonModeChange(
                selectedSeasonState.mode === "finalized" ? "live" : "finalized",
              )
            }
            type="button"
            variant={
              selectedSeasonState.mode === "finalized" ? "ghost" : "steel"
            }
          >
            {selectedSeasonState.mode === "finalized" ? (
              <Radio data-icon="inline-start" />
            ) : (
              <LockKeyhole data-icon="inline-start" />
            )}
            {selectedSeasonState.mode === "finalized"
              ? "Return live"
              : "Mark finalized"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function PushConfirmDialog({
  busy,
  error,
  intent,
  onCancel,
  onConfirm,
}: {
  busy: boolean;
  error: string | null;
  intent: PushIntent | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const isPushAll = intent?.action === "pushAll";
  return (
    <Dialog
      description={
        isPushAll
          ? "Promote every season from the active saved checkpoint. The canonical snapshot composes per-season pushes."
          : `Promote ${intent?.season ?? "the selected"} season from the active saved checkpoint. Other pushed seasons remain in the canonical snapshot.`
      }
      error={error}
      footer={
        <>
          <Button
            disabled={busy}
            onClick={onCancel}
            type="button"
            variant="ghost"
          >
            Cancel
          </Button>
          <Button
            loading={busy}
            loadingLabel={isPushAll ? "Pushing all seasons" : "Pushing season"}
            onClick={onConfirm}
            type="button"
          >
            {isPushAll ? "Confirm push all" : "Confirm push"}
          </Button>
        </>
      }
      loading={busy}
      onOpenChange={(open) => {
        if (!open && !busy) {
          onCancel();
        }
      }}
      open={intent !== null}
      title={isPushAll ? "Push all saved seasons" : "Push saved season"}
    >
      <div className="cell grid gap-2 p-3 text-sm text-muted-foreground">
        <p>
          Push is the canonical boundary. Saved checkpoints remain restorable,
          but the Record Book will only read pushed snapshots after T9.
        </p>
      </div>
    </Dialog>
  );
}

function GrainSummary({
  activeGrain,
  season,
}: {
  activeGrain: DataBookGrain;
  season: DataBookSeason;
}) {
  const active = grains.find((grain) => grain.value === activeGrain);
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <p className="eyebrow text-primary">{active?.label ?? "Data"}</p>
        <h2 className="heading-auspex text-lg leading-tight">
          {season.season} {active?.label ?? "Data"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {active?.deck ?? "Imported league data for this season."}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <StatusPill tone="info">{season.summary.teams} teams</StatusPill>
        <StatusPill tone="neutral">
          {season.summary.teamWeekFacts} team-weeks
        </StatusPill>
        <StatusPill tone="neutral">
          {formatNumber(season.summary.seasonTotalPoints)} PF
        </StatusPill>
      </div>
    </div>
  );
}

function EditableTextCell({
  ariaLabel,
  canEdit,
  className,
  draft,
  edit,
  onConfirm,
  value,
}: {
  ariaLabel: string;
  canEdit: boolean;
  className?: string;
  draft: boolean;
  edit: EditableDimension | null;
  onConfirm: (request: EditableCellRequest) => void;
  value: string;
}) {
  const inputId = useId();
  const [isEditing, setIsEditing] = useState(false);
  const [draftValue, setDraftValue] = useState(value);

  useEffect(() => {
    if (!isEditing) {
      setDraftValue(value);
    }
  }, [isEditing, value]);

  const display = (
    <>
      <span className={className}>{value}</span>
      {draft ? (
        <StatusPill
          className="ml-2 align-middle"
          showDot={false}
          tone="warning"
        >
          Draft
        </StatusPill>
      ) : null}
    </>
  );

  if (!canEdit || !edit) {
    return display;
  }

  if (isEditing) {
    return (
      <form
        className="flex min-w-[14rem] flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const nextValue = draftValue.trim();
          if (!nextValue || nextValue === value) {
            setDraftValue(value);
            setIsEditing(false);
            return;
          }
          setIsEditing(false);
          onConfirm({
            edit,
            nextValue,
            previousValue: value,
          });
        }}
      >
        <label className="sr-only" htmlFor={inputId}>
          {ariaLabel}
        </label>
        <Input
          className="min-w-0 flex-1"
          id={inputId}
          onChange={(event) => setDraftValue(event.currentTarget.value)}
          value={draftValue}
        />
        <Button aria-label={`Confirm ${ariaLabel}`} size="icon" type="submit">
          <Check aria-hidden="true" className="size-4" />
        </Button>
        <Button
          aria-label={`Cancel ${ariaLabel}`}
          onClick={() => {
            setDraftValue(value);
            setIsEditing(false);
          }}
          size="icon"
          type="button"
          variant="ghost"
        >
          <X aria-hidden="true" className="size-4" />
        </Button>
      </form>
    );
  }

  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      {display}
      <Button
        aria-label={`Edit ${ariaLabel}`}
        onClick={() => setIsEditing(true)}
        size="icon"
        type="button"
        variant="ghost"
      >
        <Edit3 aria-hidden="true" className="size-4" />
      </Button>
    </span>
  );
}

function ScopePromptDialog({
  busy,
  error,
  onCancel,
  onScopeChange,
  onSubmit,
  pendingEdit,
  reason,
  scope,
  setReason,
}: {
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onScopeChange: (scope: CuratedEditScope) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  pendingEdit: PendingDimensionEdit | null;
  reason: string;
  scope: CuratedEditScope;
  setReason: (reason: string) => void;
}) {
  const formId = useId();
  return (
    <Dialog
      description="Choose how far this draft dimension edit should propagate before it is ledgered."
      error={error}
      footer={
        <>
          <Button
            disabled={busy}
            onClick={onCancel}
            type="button"
            variant="ghost"
          >
            Cancel
          </Button>
          <Button
            form={formId}
            loading={busy}
            loadingLabel="Applying draft edit"
            type="submit"
          >
            Apply draft edit
          </Button>
        </>
      }
      loading={busy}
      onOpenChange={(open) => {
        if (!open && !busy) {
          onCancel();
        }
      }}
      open={pendingEdit !== null}
      title="Apply data edit"
    >
      {pendingEdit ? (
        <form className="grid gap-4" id={formId} onSubmit={onSubmit}>
          <div className="cell grid gap-2 p-3">
            <p className="font-mono text-xs uppercase tracking-[0.14em] text-ink-4">
              {pendingEdit.edit.fieldLabel}
            </p>
            <div className="grid gap-1 text-sm">
              <span className="text-muted-foreground">
                Before:{" "}
                <span className="text-foreground">
                  {pendingEdit.previousValue}
                </span>
              </span>
              <span className="text-muted-foreground">
                After:{" "}
                <span className="font-medium text-foreground">
                  {pendingEdit.nextValue}
                </span>
              </span>
            </div>
          </div>
          <Field
            controlId="data-book-edit-scope"
            hint="Real names default to all years; team names default to this year only."
            label="Scope"
          >
            <Select
              onValueChange={(value) =>
                onScopeChange(value as CuratedEditScope)
              }
              options={[
                {
                  description: "Propagate this dimension value across seasons.",
                  label: "Apply to all years",
                  value: "all_years",
                },
                {
                  description: "Keep the edit scoped to the selected season.",
                  label: "This year only",
                  value: "this_year_only",
                },
              ]}
              value={scope}
            />
          </Field>
          <Field
            controlId="data-book-edit-reason"
            hint="Optional; saved with the data edit ledger row."
            label="Reason"
          >
            <Input
              onChange={(event) => setReason(event.currentTarget.value)}
              placeholder={pendingEdit.edit.defaultReason}
              value={reason}
            />
          </Field>
        </form>
      ) : null}
    </Dialog>
  );
}

function peopleColumns({
  canEditData,
  isDraftCell,
  onStartEdit,
  season,
}: {
  canEditData: boolean;
  isDraftCell: (
    targetKind: "person" | "team_season",
    targetId: string | null | undefined,
    field: "canonical_name" | "team_name",
  ) => boolean;
  onStartEdit: (request: EditableCellRequest) => void;
  season: DataBookSeason;
}): readonly DataTableColumn<DataBookPersonRow>[] {
  return [
    {
      cell: (row) => (
        <EditableTextCell
          ariaLabel={`real name for ${row.personName}`}
          canEdit={canEditData}
          className="font-medium text-foreground"
          draft={isDraftCell("person", row.personId, "canonical_name")}
          edit={
            row.personId
              ? {
                  defaultReason: "Corrected real name from Data Book",
                  defaultScope: "all_years",
                  field: "canonical_name",
                  fieldLabel: "real name",
                  season: season.season,
                  targetId: row.personId,
                  targetKind: "person",
                }
              : null
          }
          onConfirm={onStartEdit}
          value={row.personName}
        />
      ),
      header: "Person",
      id: "person",
    },
    {
      cell: (row) => (
        <EditableTextCell
          ariaLabel={`team name for ${row.personName}`}
          canEdit={canEditData}
          draft={isDraftCell("team_season", row.teamSeasonId, "team_name")}
          edit={{
            defaultReason: "Corrected team name from Data Book",
            defaultScope: "this_year_only",
            field: "team_name",
            fieldLabel: "team name",
            season: season.season,
            targetId: row.teamSeasonId,
            targetKind: "team_season",
          }}
          onConfirm={onStartEdit}
          value={row.teamName}
        />
      ),
      header: "Team name",
      id: "team",
    },
    {
      cell: (row) =>
        row.ownerNames.length > 0 ? row.ownerNames.join(", ") : "-",
      header: "Owner source",
      id: "owner-source",
      priority: "desktop",
    },
    {
      cell: (row) => row.providerTeamId,
      header: "Provider team",
      id: "provider-team",
      priority: "desktop",
    },
    {
      cell: (row) => row.mappingMethod ?? "-",
      header: "Mapping",
      id: "mapping",
      priority: "desktop",
    },
    {
      align: "right",
      cell: (row) =>
        row.confidence === null ? "-" : formatNumber(row.confidence, 4),
      header: "Confidence",
      id: "confidence",
      priority: "desktop",
    },
  ];
}

const settingColumns: readonly DataTableColumn<DataBookSettingRow>[] = [
  {
    cell: (row) => (
      <StatusPill
        showDot={false}
        tone={row.group === "Settings" ? "info" : "neutral"}
      >
        {row.group}
      </StatusPill>
    ),
    header: "Group",
    id: "group",
  },
  {
    cell: (row) => (
      <span className="font-medium text-foreground">{row.label}</span>
    ),
    header: "Field",
    id: "field",
  },
  {
    cell: (row) => (
      <span className="metric whitespace-normal">{row.value}</span>
    ),
    header: "Value",
    id: "value",
  },
  {
    cell: (row) => row.detail ?? "-",
    header: "Detail",
    id: "detail",
    priority: "desktop",
  },
];

type DraftCellLookup = (
  targetKind: "person" | "team_season",
  targetId: string | null | undefined,
  field: "canonical_name" | "team_name",
) => boolean;

function TeamIdentityCell({
  canEditData,
  isDraftCell,
  onStartEdit,
  row,
  season,
}: {
  canEditData: boolean;
  isDraftCell: DraftCellLookup;
  onStartEdit: (request: EditableCellRequest) => void;
  row: DataBookWeekRow;
  season: number;
}) {
  return (
    <div className="grid gap-0.5">
      <span className="font-medium text-foreground">{row.managerName}</span>
      <EditableTextCell
        ariaLabel={`team name for ${row.managerName} week ${row.scoringPeriod}`}
        canEdit={canEditData}
        className="text-xs text-muted-foreground"
        draft={isDraftCell("team_season", row.teamSeasonId, "team_name")}
        edit={{
          defaultReason: "Corrected team name from Data Book",
          defaultScope: "this_year_only",
          field: "team_name",
          fieldLabel: "team name",
          season,
          targetId: row.teamSeasonId,
          targetKind: "team_season",
        }}
        onConfirm={onStartEdit}
        value={row.teamName}
      />
    </div>
  );
}

function weekColumns({
  canEditData,
  isDraftCell,
  onStartEdit,
  season,
}: {
  canEditData: boolean;
  isDraftCell: DraftCellLookup;
  onStartEdit: (request: EditableCellRequest) => void;
  season: DataBookSeason;
}): readonly DataTableColumn<DataBookWeekRow>[] {
  return [
    {
      cell: (row) => <span className="metric">W{row.scoringPeriod}</span>,
      header: "Week",
      id: "week",
    },
    {
      cell: (row) => (
        <TeamIdentityCell
          canEditData={canEditData}
          isDraftCell={isDraftCell}
          onStartEdit={onStartEdit}
          row={row}
          season={season.season}
        />
      ),
      header: "Team",
      id: "team",
    },
    {
      align: "right",
      cell: (row) => (
        <SignedValue tone="default">{formatNumber(row.pointsFor)}</SignedValue>
      ),
      header: "Score",
      id: "score",
    },
    {
      cell: (row) => (
        <div className="grid gap-0.5">
          <span>{row.opponent}</span>
          {row.opponentTeamName ? (
            <span className="text-xs text-muted-foreground">
              {row.opponentTeamName}
            </span>
          ) : null}
        </div>
      ),
      header: "Opponent",
      id: "opponent",
    },
    {
      cell: (row) => (
        <StatusPill tone={resultTone(row.result)}>
          {resultLabel(row.result)}
        </StatusPill>
      ),
      header: "Result",
      id: "result",
    },
    {
      align: "right",
      cell: (row) => <span className="metric">{row.span}</span>,
      header: "Span",
      id: "span",
    },
    {
      cell: (row) =>
        row.isChampionship
          ? "Championship"
          : row.isPlayoff
            ? "Playoff"
            : "Regular",
      header: "Segment",
      id: "segment",
      priority: "desktop",
    },
    {
      align: "right",
      cell: (row) => formatNumber(row.pointsAgainst),
      header: "PA",
      id: "points-against",
      priority: "desktop",
    },
  ];
}

function peopleMobileRows({
  canEditData,
  isDraftCell,
  onStartEdit,
  season,
}: {
  canEditData: boolean;
  isDraftCell: DraftCellLookup;
  onStartEdit: (request: EditableCellRequest) => void;
  season: DataBookSeason;
}): readonly DataCardRow[] {
  return season.people.map((row) => ({
    cells: [
      {
        label: "Person",
        value: (
          <EditableTextCell
            ariaLabel={`real name for ${row.personName}`}
            canEdit={canEditData}
            className="font-medium text-foreground"
            draft={isDraftCell("person", row.personId, "canonical_name")}
            edit={
              row.personId
                ? {
                    defaultReason: "Corrected real name from Data Book",
                    defaultScope: "all_years",
                    field: "canonical_name",
                    fieldLabel: "real name",
                    season: season.season,
                    targetId: row.personId,
                    targetKind: "person",
                  }
                : null
            }
            onConfirm={onStartEdit}
            value={row.personName}
          />
        ),
      },
      {
        label: "Team name",
        value: (
          <EditableTextCell
            ariaLabel={`team name for ${row.personName}`}
            canEdit={canEditData}
            draft={isDraftCell("team_season", row.teamSeasonId, "team_name")}
            edit={{
              defaultReason: "Corrected team name from Data Book",
              defaultScope: "this_year_only",
              field: "team_name",
              fieldLabel: "team name",
              season: season.season,
              targetId: row.teamSeasonId,
              targetKind: "team_season",
            }}
            onConfirm={onStartEdit}
            value={row.teamName}
          />
        ),
      },
      {
        label: "Owner source",
        value: row.ownerNames.length > 0 ? row.ownerNames.join(", ") : "-",
      },
      { label: "Provider team", value: row.providerTeamId },
      { label: "Mapping", value: row.mappingMethod ?? "-" },
      {
        label: "Confidence",
        value: row.confidence === null ? "-" : formatNumber(row.confidence, 4),
      },
    ],
    id: row.id,
    title: `Team ${row.providerTeamId}`,
  }));
}

function PeopleTable({
  canEditData,
  isDraftCell,
  onStartEdit,
  season,
}: {
  canEditData: boolean;
  isDraftCell: DraftCellLookup;
  onStartEdit: (request: EditableCellRequest) => void;
  season: DataBookSeason;
}) {
  return (
    <DataTable
      ariaLabel={`${season.season} Data Book people`}
      caption="People and team names for the selected season"
      columns={peopleColumns({
        canEditData,
        isDraftCell,
        onStartEdit,
        season,
      })}
      empty="No people or team-season rows have been imported for this season."
      getRowId={(row) => row.id}
      getRowName={(row) => row.personName}
      mobileRows={peopleMobileRows({
        canEditData,
        isDraftCell,
        onStartEdit,
        season,
      })}
      rows={season.people}
    />
  );
}

function SettingsTable({ season }: { season: DataBookSeason }) {
  return (
    <DataTable
      ariaLabel={`${season.season} Data Book settings`}
      caption="Season settings and summary values"
      columns={settingColumns}
      empty="No season settings or summary rows have been imported yet."
      getRowId={(row) => row.id}
      getRowName={(row) => row.label}
      rows={season.settings}
    />
  );
}

function WeeksTable({
  canEditData,
  isDraftCell,
  onStartEdit,
  season,
}: {
  canEditData: boolean;
  isDraftCell: DraftCellLookup;
  onStartEdit: (request: EditableCellRequest) => void;
  season: DataBookSeason;
}) {
  return (
    <DataTable
      ariaLabel={`${season.season} Data Book weeks`}
      caption="Team-week matchup facts for the selected season"
      columns={weekColumns({
        canEditData,
        isDraftCell,
        onStartEdit,
        season,
      })}
      empty="No weekly facts have been materialized for this season."
      getRowId={(row) => row.id}
      getRowName={(row) => `${row.managerName} week ${row.scoringPeriod}`}
      rows={season.weeks}
    />
  );
}

function ActiveGrain({
  activeGrain,
  canEditData,
  isDraftCell,
  onStartEdit,
  season,
}: {
  activeGrain: DataBookGrain;
  canEditData: boolean;
  isDraftCell: DraftCellLookup;
  onStartEdit: (request: EditableCellRequest) => void;
  season: DataBookSeason;
}) {
  switch (activeGrain) {
    case "people":
      return (
        <PeopleTable
          canEditData={canEditData}
          isDraftCell={isDraftCell}
          onStartEdit={onStartEdit}
          season={season}
        />
      );
    case "settings":
      return <SettingsTable season={season} />;
    case "weeks":
      return (
        <WeeksTable
          canEditData={canEditData}
          isDraftCell={isDraftCell}
          onStartEdit={onStartEdit}
          season={season}
        />
      );
  }
}

function DataBookDraftNotice({ message }: { message: string }) {
  return (
    <div className="cell flex flex-wrap items-center gap-3 p-3">
      <StatusPill showDot={false} tone="warning">
        Draft change
      </StatusPill>
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

export function DataBookView({
  canEditData = false,
  data,
}: {
  canEditData?: boolean;
  data: DataBookPageData;
}) {
  const router = useRouter();
  const [activeGrain, setActiveGrain] = useState<DataBookGrain>("people");
  const [draftData, setDraftData] = useState(data);
  const [curationState, setCurationState] = useState(data.curation);
  const initialSeason = draftData.seasons[0]?.season ?? draftData.league.season;
  const [selectedSeason, setSelectedSeason] = useState(initialSeason);
  const [pendingEdit, setPendingEdit] = useState<PendingDimensionEdit | null>(
    null,
  );
  const [editScope, setEditScope] = useState<CuratedEditScope>("all_years");
  const [editReason, setEditReason] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [draftCellKeys, setDraftCellKeys] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [draftMessage, setDraftMessage] = useState<string | null>(null);
  const [curationMessage, setCurationMessage] = useState<string | null>(null);
  const [curationError, setCurationError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [restoreCheckpointId, setRestoreCheckpointId] = useState(
    data.curation.activeCheckpoint?.id ??
      data.curation.checkpoints[0]?.id ??
      "",
  );
  const [pushIntent, setPushIntent] = useState<PushIntent | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);
  const season = selectedSeasonOrFallback(draftData.seasons, selectedSeason);
  const editApiUrl = `/api/leagues/${draftData.league.id}/curation/edits`;
  const checkpointsApiUrl = `/api/leagues/${draftData.league.id}/curation/checkpoints`;
  const pushApiUrl = `/api/leagues/${draftData.league.id}/curation/push`;
  const selectedSeasonState = curationForSeason(curationState, season.season);

  useEffect(() => {
    if (
      curationState.checkpoints.length > 0 &&
      !curationState.checkpoints.some(
        (checkpoint) => checkpoint.id === restoreCheckpointId,
      )
    ) {
      setRestoreCheckpointId(curationState.checkpoints[0]?.id ?? "");
    }
  }, [curationState.checkpoints, restoreCheckpointId]);

  function isDraftCell(
    targetKind: "person" | "team_season",
    targetId: string | null | undefined,
    field: "canonical_name" | "team_name",
  ) {
    const key = draftCellKey(targetKind, targetId, field);
    return key ? draftCellKeys.has(key) : false;
  }

  function startEdit(request: EditableCellRequest) {
    setPendingEdit(request);
    setEditScope(request.edit.defaultScope);
    setEditReason("");
    setEditError(null);
  }

  async function submitPendingEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const current = pendingEdit;
    if (!current || editBusy) {
      return;
    }

    setEditBusy(true);
    setEditError(null);
    try {
      const response = await postJson<CuratedEditResponse>(editApiUrl, {
        editClass: "cosmetic",
        field: current.edit.field,
        reason: editReason.trim() || current.edit.defaultReason,
        scope: editScope,
        targetId: current.edit.targetId,
        targetKind: current.edit.targetKind,
        value: current.nextValue,
        ...(editScope === "this_year_only"
          ? { season: current.edit.season }
          : {}),
      });
      const resolvedResponse: CuratedEditResponse & {
        scope: CuratedEditScope;
      } = {
        ...response,
        scope: response.scope ?? editScope,
      };

      setDraftData((currentData) =>
        applyLocalDimensionEdit(currentData, current, resolvedResponse),
      );
      setDraftCellKeys((keys) => {
        const next = new Set(keys);
        for (const key of draftKeysForEdit(current.edit, resolvedResponse)) {
          next.add(key);
        }
        return next;
      });
      setDraftMessage(
        `${current.edit.fieldLabel} recorded as a ${scopeLabel(
          resolvedResponse.scope,
        ).toLowerCase()} draft edit. It is not pushed to the Record Book yet.`,
      );
      setCurationState((currentState) => ({
        ...currentState,
        hasUnsavedDraft: true,
        seasons: currentState.seasons.map((entry) => ({
          ...entry,
          hasUnsavedDraft: true,
        })),
      }));
      setCurationMessage(null);
      setPendingEdit(null);
    } catch (cause) {
      setEditError(cause instanceof Error ? cause.message : "Edit failed");
    } finally {
      setEditBusy(false);
    }
  }

  async function saveCheckpoint() {
    if (busyAction) {
      return;
    }
    setBusyAction("save");
    setCurationError(null);
    setCurationMessage(null);
    try {
      const response = await postJson<CheckpointMutationResponse>(
        checkpointsApiUrl,
        {
          label: `Data Book save ${season.season}`,
          note: `Saved ${season.season} draft from Data Book`,
        },
      );
      setCurationState((current) =>
        markCheckpointActive(current, response.checkpoint),
      );
      setRestoreCheckpointId(response.checkpoint.id);
      setCurationMessage(
        "Checkpoint saved. Draft changes remain out of the canonical Record Book until pushed.",
      );
    } catch (cause) {
      setCurationError(
        cause instanceof Error ? cause.message : "Checkpoint save failed",
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function restoreCheckpoint() {
    if (busyAction || !restoreCheckpointId) {
      return;
    }
    setBusyAction("restore");
    setCurationError(null);
    setCurationMessage(null);
    try {
      const response = await postJson<CheckpointMutationResponse>(
        `${checkpointsApiUrl}/${restoreCheckpointId}/restore`,
        {
          reason: "Restored checkpoint from Data Book",
        },
      );
      setCurationState((current) =>
        markCheckpointActive(current, response.checkpoint),
      );
      setDraftCellKeys(new Set());
      setDraftMessage(null);
      setCurationMessage("Checkpoint restored. Refreshing draft tables.");
      router.refresh();
    } catch (cause) {
      setCurationError(
        cause instanceof Error ? cause.message : "Checkpoint restore failed",
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function confirmPush() {
    if (busyAction || !pushIntent) {
      return;
    }
    const intent = pushIntent;
    setBusyAction(intent.action);
    setPushError(null);
    setCurationError(null);
    setCurationMessage(null);
    try {
      const response = await postJson<CurationSeasonPushResponse>(pushApiUrl, {
        action: intent.action,
        checkpointId: curationState.activeCheckpoint?.id,
        reason:
          intent.action === "pushAll"
            ? "Pushed all saved seasons from Data Book"
            : `Pushed ${intent.season} saved season from Data Book`,
        ...(intent.action === "push" ? { season: intent.season } : {}),
      });
      const pushes =
        intent.action === "pushAll"
          ? (response.pushes ?? [])
          : response.push
            ? [response.push]
            : [];
      setCurationState((current) => markPushes(current, pushes));
      setPushIntent(null);
      setCurationMessage(
        intent.action === "pushAll"
          ? "All saved seasons were pushed into the canonical snapshot."
          : `${intent.season} was pushed into the canonical snapshot.`,
      );
    } catch (cause) {
      setPushError(cause instanceof Error ? cause.message : "Push failed");
    } finally {
      setBusyAction(null);
    }
  }

  async function changeSeasonMode(mode: DataBookCurationMode) {
    if (busyAction) {
      return;
    }
    setBusyAction("mode");
    setCurationError(null);
    setCurationMessage(null);
    try {
      const response = await postJson<CurationSeasonModeResponse>(
        `/api/leagues/${draftData.league.id}/curation/seasons/${season.season}/mode`,
        {
          mode,
          reason:
            mode === "finalized"
              ? "Marked finalized from Data Book"
              : "Returned season to live mode from Data Book",
        },
      );
      setCurationState((current) => markSeasonMode(current, response.state));
      setCurationMessage(
        mode === "finalized"
          ? `${season.season} is now curate-and-push.`
          : `${season.season} is back in live streaming mode.`,
      );
    } catch (cause) {
      setCurationError(
        cause instanceof Error ? cause.message : "Season mode change failed",
      );
    } finally {
      setBusyAction(null);
    }
  }

  const navItems = useMemo<PublicationNavItem[]>(
    () =>
      grains.map((grain) => ({
        active: activeGrain === grain.value,
        icon:
          grain.value === "people" ? (
            <Users aria-hidden="true" className="size-4" />
          ) : grain.value === "settings" ? (
            <Database aria-hidden="true" className="size-4" />
          ) : (
            <BookOpen aria-hidden="true" className="size-4" />
          ),
        label: grain.label,
        onSelect: () => setActiveGrain(grain.value),
        value: grain.value,
      })),
    [activeGrain],
  );

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-7xl flex-col gap-6 px-4 py-5 pb-[calc(--spacing(6)+env(safe-area-inset-bottom))] sm:px-6">
      <PublicationMasthead
        actions={[
          {
            href: `/leagues/${draftData.league.id}`,
            icon: <ArrowLeft data-icon="inline-start" />,
            label: "League home",
          },
          {
            href: `/leagues/${draftData.league.id}/records`,
            icon: <BookOpen data-icon="inline-start" />,
            label: "Records",
          },
        ]}
        controls={
          <div className="grid gap-4 xl:grid-cols-[minmax(12rem,14rem)_minmax(0,1fr)]">
            <SeasonControl
              onSeasonChange={setSelectedSeason}
              season={season}
              seasons={draftData.seasons}
            />
            <CurationControls
              busyAction={busyAction}
              canEditData={canEditData}
              curation={curationState}
              error={curationError}
              message={curationMessage}
              onOpenPushDialog={(intent) => {
                setPushError(null);
                setPushIntent(intent);
              }}
              onRestore={restoreCheckpoint}
              onSave={saveCheckpoint}
              onSeasonModeChange={changeSeasonMode}
              restoreCheckpointId={restoreCheckpointId}
              selectedSeasonState={selectedSeasonState}
              setRestoreCheckpointId={setRestoreCheckpointId}
            />
          </div>
        }
        deck={`${draftData.league.provider.toUpperCase()} ${draftData.league.providerLeagueId}. Live draft tables for data curation, displayed one season at a time.`}
        eyebrow="DATA BOOK"
        navAriaLabel="Data Book grains"
        navItems={navItems}
        sectionLabel={`${season.season} season`}
        title={`${draftData.league.name} Data Book`}
      />

      {draftData.seasons.length === 0 ? (
        <EmptyState className="p-5" title="No league data imported yet">
          Import history to populate the Data Book tables.
        </EmptyState>
      ) : (
        <section className="grid gap-4" aria-live="polite">
          <GrainSummary activeGrain={activeGrain} season={season} />
          {draftMessage ? <DataBookDraftNotice message={draftMessage} /> : null}
          <ActiveGrain
            activeGrain={activeGrain}
            canEditData={canEditData}
            isDraftCell={isDraftCell}
            onStartEdit={startEdit}
            season={season}
          />
        </section>
      )}

      <ScopePromptDialog
        busy={editBusy}
        error={editError}
        onCancel={() => {
          if (!editBusy) {
            setPendingEdit(null);
          }
        }}
        onScopeChange={setEditScope}
        onSubmit={submitPendingEdit}
        pendingEdit={pendingEdit}
        reason={editReason}
        scope={editScope}
        setReason={setEditReason}
      />
      <PushConfirmDialog
        busy={busyAction === "push" || busyAction === "pushAll"}
        error={pushError}
        intent={pushIntent}
        onCancel={() => {
          if (busyAction === null) {
            setPushIntent(null);
            setPushError(null);
          }
        }}
        onConfirm={confirmPush}
      />
    </main>
  );
}
