"use client";

import { ChevronDown, Edit3, RotateCcw, Save, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { type KVItem, KVList } from "@/components/ui/kv";
import { StatusPill, type StatusTone } from "@/components/ui/status-pill";
import { cn } from "@/lib/utils";
import type { EditLedgerEntry } from "./edit-ledger-types";

type LedgerEntryKind = "edit" | "push" | "restore" | "save";

interface EditLedgerFeedProps {
  readonly className?: string;
  readonly emptyBody?: string;
  readonly emptyTitle?: string;
  readonly entries: readonly EditLedgerEntry[];
  readonly initialOpenIds?: readonly string[];
  readonly maxEntries?: number;
}

type JsonRecord = Record<string, unknown>;

export function EditLedgerFeed({
  className,
  emptyBody = "This league has no recorded curation activity yet.",
  emptyTitle = "No curation activity yet",
  entries,
  initialOpenIds = [],
  maxEntries,
}: EditLedgerFeedProps) {
  const orderedEntries = useMemo(
    () =>
      [...entries]
        .sort(
          (left, right) =>
            right.createdAt.localeCompare(left.createdAt) ||
            right.id.localeCompare(left.id),
        )
        .slice(0, maxEntries ?? entries.length),
    [entries, maxEntries],
  );
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(
    () => new Set(initialOpenIds),
  );

  if (orderedEntries.length === 0) {
    return <EmptyState title={emptyTitle}>{emptyBody}</EmptyState>;
  }

  return (
    <ol
      aria-label="Edit Ledger activity"
      className={cn("grid gap-2", className)}
      data-slot="edit-ledger-feed"
    >
      {orderedEntries.map((entry) => {
        const isOpen = openIds.has(entry.id);
        const kind = entryKind(entry);
        const summary = entrySummary(entry, kind);
        const panelId = `edit-ledger-entry-${entry.id}`;
        const buttonId = `${panelId}-button`;

        return (
          <li key={entry.id}>
            <article
              className="cell overflow-hidden p-0"
              data-ledger-entry-kind={kind}
            >
              <button
                aria-controls={panelId}
                aria-expanded={isOpen}
                aria-label={`${isOpen ? "Collapse" : "Expand"} ${summary}`}
                className="grid min-h-11 w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3 py-3 text-left outline-none transition-[background-color,box-shadow] hover:bg-primary/5 focus-visible:shadow-[var(--focus-ring-shadow)] sm:px-4"
                id={buttonId}
                onClick={() => {
                  setOpenIds((current) => {
                    const next = new Set(current);
                    if (next.has(entry.id)) {
                      next.delete(entry.id);
                    } else {
                      next.add(entry.id);
                    }
                    return next;
                  });
                }}
                type="button"
              >
                <span
                  aria-hidden="true"
                  className="chip-glyph flex size-9 items-center justify-center"
                >
                  <EntryIcon kind={kind} />
                </span>
                <span className="min-w-0">
                  <span className="flex min-w-0 flex-wrap items-center gap-2">
                    <StatusPill showDot={false} tone={kindTone(kind, entry)}>
                      {kindLabel(kind)}
                    </StatusPill>
                    <span className="truncate font-display text-sm font-medium text-foreground">
                      {summary}
                    </span>
                  </span>
                  <span className="mt-1 flex min-w-0 flex-wrap gap-x-2 gap-y-1 font-mono text-xs text-muted-foreground">
                    <time dateTime={entry.createdAt}>
                      {formatTimestamp(entry.createdAt)}
                    </time>
                    <span aria-hidden="true">/</span>
                    <span>{actorLabel(entry)}</span>
                    {entry.scope ? (
                      <>
                        <span aria-hidden="true">/</span>
                        <span>{scopeLabel(entry.scope)}</span>
                      </>
                    ) : null}
                  </span>
                </span>
                <ChevronDown
                  aria-hidden="true"
                  className={cn(
                    "size-4 text-ink-3 transition-transform",
                    isOpen ? "rotate-180 text-primary" : "",
                  )}
                />
              </button>

              {isOpen ? (
                <section
                  aria-labelledby={buttonId}
                  className="grid gap-4 border-t border-[var(--hair)] p-3 sm:p-4"
                  id={panelId}
                >
                  <DiffPair entry={entry} kind={kind} />
                  <KVList items={metadataItems(entry, kind)} />
                </section>
              ) : null}
            </article>
          </li>
        );
      })}
    </ol>
  );
}

function EntryIcon({ kind }: { readonly kind: LedgerEntryKind }) {
  switch (kind) {
    case "save":
      return <Save className="size-4 text-primary" />;
    case "push":
      return <Upload className="size-4 text-jade" />;
    case "restore":
      return <RotateCcw className="size-4 text-amber" />;
    case "edit":
      return <Edit3 className="size-4 text-primary" />;
  }
}

function DiffPair({
  entry,
  kind,
}: {
  readonly entry: EditLedgerEntry;
  readonly kind: LedgerEntryKind;
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <section
        aria-label="Before value"
        className="rounded-card border border-coral/40 bg-coral/10 p-3 shadow-[var(--bevel)]"
      >
        <p className="font-mono text-xs uppercase tracking-[0.12em] text-coral">
          [-] Before
        </p>
        <code className="mt-2 block whitespace-pre-wrap break-words font-mono text-xs leading-5 text-coral">
          {diffValue(entry, kind, "before")}
        </code>
      </section>
      <section
        aria-label="After value"
        className="rounded-card border border-jade/40 bg-jade/10 p-3 shadow-[var(--bevel)]"
      >
        <p className="font-mono text-xs uppercase tracking-[0.12em] text-jade">
          [+] After
        </p>
        <code className="mt-2 block whitespace-pre-wrap break-words font-mono text-xs leading-5 text-jade">
          {diffValue(entry, kind, "after")}
        </code>
      </section>
    </div>
  );
}

function entryKind(entry: EditLedgerEntry): LedgerEntryKind {
  if (
    entry.targetKind === "curation_checkpoint" &&
    entry.field === "checkpoint_save"
  ) {
    return "save";
  }
  if (
    entry.targetKind === "curation_checkpoint" &&
    entry.field === "checkpoint_restore"
  ) {
    return "restore";
  }
  if (entry.targetKind === "curation_push" && entry.field === "season_push") {
    return "push";
  }
  return "edit";
}

function entrySummary(entry: EditLedgerEntry, kind: LedgerEntryKind): string {
  switch (kind) {
    case "save": {
      const after = asRecord(entry.afterValue);
      const label = readString(after, "label");
      const checkpoint = label
        ? `"${label}"`
        : shortId(readString(after, "checkpointId"));
      return `Saved checkpoint ${checkpoint} for ${seasonsLabel(
        seasonsFromRecord(after),
      )}`;
    }
    case "push": {
      const after = asRecord(entry.afterValue);
      const season = readNumber(after, "season");
      return `Pushed ${season ?? "selected"} season snapshot`;
    }
    case "restore": {
      const after = asRecord(entry.afterValue);
      return `Restored checkpoint ${shortId(
        readString(after, "checkpointId"),
      )} for ${seasonsLabel(seasonsFromRecord(after))}`;
    }
    case "edit":
      return `Edited ${targetLabel(entry.targetKind)} ${entry.field}`;
  }
}

function kindLabel(kind: LedgerEntryKind): string {
  switch (kind) {
    case "save":
      return "Save";
    case "push":
      return "Push";
    case "restore":
      return "Restore";
    case "edit":
      return "Edit";
  }
}

function kindTone(kind: LedgerEntryKind, entry: EditLedgerEntry): StatusTone {
  switch (kind) {
    case "push":
      return "success";
    case "save":
      return "info";
    case "restore":
      return "warning";
    case "edit":
      return entry.editClass === "substantive" ? "warning" : "neutral";
  }
}

function sourceLabel(source: EditLedgerEntry["source"]): string {
  switch (source) {
    case "data_correction_audit":
      return "Integrity audit";
    case "identity_audit":
      return "Identity audit";
    case "league_data_edit":
      return "Data edit";
  }
}

function metadataItems(
  entry: EditLedgerEntry,
  kind: LedgerEntryKind,
): readonly KVItem[] {
  const after = asRecord(entry.afterValue);
  const metadata: KVItem[] = [
    { label: "Kind", value: kindLabel(kind) },
    { label: "Field", value: entry.field },
    { label: "Scope", value: entry.scope ? scopeLabel(entry.scope) : "none" },
    { label: "Actor", value: actorLabel(entry) },
    {
      label: "When",
      value: (
        <time dateTime={entry.createdAt}>
          {formatTimestamp(entry.createdAt)}
        </time>
      ),
    },
    {
      label: "Target",
      value: `${targetLabel(entry.targetKind)} ${shortId(entry.targetId)}`,
    },
    { label: "Source", value: sourceLabel(entry.source) },
    { label: "Reason", value: entry.reason ?? "none" },
  ];

  const seasons = seasonsFromRecord(after);
  if (seasons.length > 0) {
    metadata.splice(2, 0, { label: "Seasons", value: seasonsLabel(seasons) });
  }

  return metadata;
}

function diffValue(
  entry: EditLedgerEntry,
  kind: LedgerEntryKind,
  side: "after" | "before",
): string {
  const value = side === "after" ? entry.afterValue : entry.beforeValue;
  const record = asRecord(value);

  switch (kind) {
    case "save":
      return side === "after"
        ? checkpointAfterSummary(record)
        : checkpointBeforeSummary(record);
    case "restore":
      return side === "after"
        ? checkpointAfterSummary(record)
        : "Draft state before restore";
    case "push":
      return side === "after"
        ? pushAfterSummary(record)
        : pushBeforeSummary(record, asRecord(entry.afterValue));
    case "edit":
      return formatDiffValue(value);
  }
}

function checkpointAfterSummary(record: JsonRecord | null): string {
  if (!record) {
    return "No checkpoint payload recorded";
  }
  const label = readString(record, "label");
  const checkpointId = readString(record, "checkpointId");
  const hash = readString(record, "snapshotHash");
  return [
    label ? `Label: ${label}` : null,
    `Checkpoint: ${shortId(checkpointId)}`,
    `Seasons: ${seasonsLabel(seasonsFromRecord(record))}`,
    hash ? `Snapshot: ${hash.slice(0, 12)}` : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join("\n");
}

function checkpointBeforeSummary(record: JsonRecord | null): string {
  if (!record) {
    return "No prior save";
  }
  const previous = readString(record, "previousCheckpointId");
  return previous
    ? `Previous checkpoint: ${shortId(previous)}`
    : "No prior save";
}

function pushAfterSummary(record: JsonRecord | null): string {
  if (!record) {
    return "No push payload recorded";
  }
  const season = readNumber(record, "season");
  const checkpointId = readString(record, "checkpointId");
  const pushId = readString(record, "pushId");
  const hash = readString(record, "snapshotHash");
  return [
    `Season: ${season ?? "unknown"}`,
    `Push: ${shortId(pushId)}`,
    `Checkpoint: ${shortId(checkpointId)}`,
    hash ? `Snapshot: ${hash.slice(0, 12)}` : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join("\n");
}

function pushBeforeSummary(
  record: JsonRecord | null,
  after: JsonRecord | null,
): string {
  if (!record) {
    const season = readNumber(after, "season");
    return `No prior push${season ? ` for ${season}` : ""}`;
  }
  const season = readNumber(record, "season");
  const checkpointId = readString(record, "checkpointId");
  const pushId = readString(record, "pushId");
  const hash = readString(record, "snapshotHash");
  return [
    `Season: ${season ?? "unknown"}`,
    `Previous push: ${shortId(pushId)}`,
    `Previous checkpoint: ${shortId(checkpointId)}`,
    hash ? `Previous snapshot: ${hash.slice(0, 12)}` : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join("\n");
}

export function compactLedgerValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "none";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return "unreadable value";
  }
}

function formatDiffValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "none";
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "unreadable value";
  }
}

function actorLabel(entry: EditLedgerEntry): string {
  if (!entry.actorUserId) {
    return "system";
  }
  if (entry.actorDisplayName) {
    return `${entry.actorDisplayName} (${shortId(entry.actorUserId)})`;
  }
  return entry.actorUserId;
}

function scopeLabel(scope: NonNullable<EditLedgerEntry["scope"]>): string {
  return scope === "all_years" ? "all years" : "this year only";
}

function targetLabel(targetKind: string): string {
  return targetKind.replaceAll("_", " ");
}

function seasonsLabel(seasons: readonly number[]): string {
  if (seasons.length === 0) {
    return "No seasons recorded";
  }
  return seasons.join(", ");
}

function seasonsFromRecord(record: JsonRecord | null): number[] {
  const seasons = record?.seasons;
  if (Array.isArray(seasons)) {
    return seasons
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value));
  }
  const season = readNumber(record, "season");
  return season ? [season] : [];
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function shortId(value: string | null | undefined): string {
  if (!value) {
    return "none";
  }
  return value.length > 12 ? value.slice(0, 8) : value;
}

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as JsonRecord;
}

function readString(record: JsonRecord | null, key: string): string | null {
  const value = record?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function readNumber(record: JsonRecord | null, key: string): number | null {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export type { EditLedgerFeedProps };
