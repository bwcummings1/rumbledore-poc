import {
  AlertTriangle,
  ArrowLeft,
  Clock3,
  FileWarning,
  Newspaper,
  ShieldAlert,
  SkipForward,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import type {
  GenerationFailureQueueData,
  GenerationFailureQueueItem,
  GenerationFailureQueueItemStatus,
} from "@/ai";
import {
  PublicationMasthead,
  type PublicationNavItem,
} from "@/components/publication/front-view";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { KVList } from "@/components/ui/kv";
import { StatTile } from "@/components/ui/stat-tile";
import { StatusPill, type StatusTone } from "@/components/ui/status-pill";
import { cn } from "@/lib/utils";
import {
  LEAGUE_PUBLICATION_SECTIONS,
  type LeaguePublicationSectionId,
} from "@/news";
import { GenerationFailureRetryButton } from "./generation-failure-retry-button";

const UTC_FORMATTER = new Intl.DateTimeFormat("en-US", {
  day: "2-digit",
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
  month: "short",
  timeZone: "UTC",
  year: "numeric",
});

function personaLabel(value: string): string {
  return value.replaceAll("_", " ");
}

function formatUtc(value: string): string {
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) {
    return "Unknown";
  }
  return `${UTC_FORMATTER.format(timestamp)} UTC`;
}

function shortHash(value: string | null): string {
  return value ? value.slice(0, 12) : "Not recorded";
}

function statusTone(status: GenerationFailureQueueItemStatus): StatusTone {
  switch (status) {
    case "failed":
      return "danger";
    case "skipped":
      return "warning";
    case "stale_pending":
      return "info";
  }
}

function statusLabel(status: GenerationFailureQueueItemStatus): string {
  switch (status) {
    case "failed":
      return "Failed";
    case "skipped":
      return "Skipped";
    case "stale_pending":
      return "Stale pending";
  }
}

function statusIcon(status: GenerationFailureQueueItemStatus) {
  switch (status) {
    case "failed":
      return <XCircle aria-hidden="true" className="size-3" />;
    case "skipped":
      return <SkipForward aria-hidden="true" className="size-3" />;
    case "stale_pending":
      return <Clock3 aria-hidden="true" className="size-3" />;
  }
}

function leaguePressNavItems(leagueId: string): PublicationNavItem[] {
  return [
    {
      active: false,
      href: `/leagues/${leagueId}/press`,
      label: "Front",
    },
    ...LEAGUE_PUBLICATION_SECTIONS.map((section) => ({
      active: false,
      href: `/leagues/${leagueId}/press/${section.slug}`,
      label: section.label,
    })),
    {
      active: true,
      href: `/leagues/${leagueId}/press/failures`,
      icon: <ShieldAlert aria-hidden="true" className="size-4" />,
      label: "Failure Queue",
    },
  ];
}

function sectionLabel(item: GenerationFailureQueueItem): string {
  if (!item.contentType) {
    return "Unclassified generation";
  }

  const section = LEAGUE_PUBLICATION_SECTIONS.find(
    (candidate) =>
      candidate.id ===
      (item.contentType === "power_rankings"
        ? ("power-rankings" satisfies LeaguePublicationSectionId)
        : item.contentType === "weekly_recap" ||
            item.contentType === "season_arc" ||
            item.contentType === "arena_recap"
          ? ("recaps" satisfies LeaguePublicationSectionId)
          : item.contentType === "milestone_record" ||
              item.contentType === "verdict_column"
            ? ("records" satisfies LeaguePublicationSectionId)
            : item.contentType === "matchup_preview" ||
                item.contentType === "transaction_reaction"
              ? ("previews" satisfies LeaguePublicationSectionId)
              : ("trash-talk" satisfies LeaguePublicationSectionId)),
  );
  return section?.label ?? "League Press";
}

function FailureQueueItemCard({ item }: { item: GenerationFailureQueueItem }) {
  return (
    <article
      aria-labelledby={`generation-run-${item.id}`}
      className="cell grid gap-4 p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow text-primary">{sectionLabel(item)}</p>
          <h2
            className="mt-1 font-display text-base font-medium leading-snug text-foreground"
            id={`generation-run-${item.id}`}
          >
            {item.contentTypeLabel} by {personaLabel(item.persona)}
          </h2>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <StatusPill
            icon={statusIcon(item.status)}
            tone={statusTone(item.status)}
          >
            {statusLabel(item.status)}
          </StatusPill>
          {item.isJudgeSkip ? (
            <StatusPill tone="danger">Judge gate</StatusPill>
          ) : null}
        </div>
      </div>

      <p className="rounded-control border border-[var(--hair)] bg-elevated/40 px-3 py-2 text-sm leading-6 text-muted-foreground">
        {item.reason}
      </p>

      <KVList
        items={[
          { label: "Trigger", value: item.triggerKey ?? item.runTriggerKey },
          { label: "Run key", value: item.runTriggerKey, tone: "muted" },
          { label: "Updated", value: formatUtc(item.updatedAt) },
          { label: "Created", value: formatUtc(item.createdAt) },
          {
            label: "Prompt hash",
            value: shortHash(item.promptPrefixHash),
            tone: item.promptPrefixHash ? "default" : "muted",
          },
        ]}
      />

      {item.contentItem ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--hair)] pt-3">
          <div className="min-w-0">
            <p className="eyebrow text-muted-foreground">Linked post</p>
            <Link
              className="mt-1 block truncate font-display text-sm font-medium text-foreground underline decoration-primary/50 underline-offset-4 hover:text-primary"
              href={item.contentItem.href}
            >
              {item.contentItem.title}
            </Link>
          </div>
          <StatusPill tone="neutral">{item.contentItem.status}</StatusPill>
        </div>
      ) : null}

      <GenerationFailureRetryButton apiUrl={item.retryApiUrl} runId={item.id} />
    </article>
  );
}

export function GenerationFailureQueueView({
  data,
}: {
  readonly data: GenerationFailureQueueData;
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-6 px-4 py-5 pb-[calc(--spacing(6)+env(safe-area-inset-bottom))] sm:px-6">
      <PublicationMasthead
        actions={[
          {
            href: `/leagues/${data.league.id}`,
            icon: <ArrowLeft data-icon="inline-start" />,
            label: "League home",
          },
          {
            href: `/leagues/${data.league.id}/press`,
            icon: <Newspaper data-icon="inline-start" />,
            label: "The Press",
          },
        ]}
        deck={`${data.league.season} ${data.league.provider.toUpperCase()} fantasy football. Skipped, failed, and stale cast runs are visible here before they become silent gaps in the league story.`}
        eyebrow="EDITORIAL CONTROL"
        navAriaLabel="Press sections"
        navItems={leaguePressNavItems(data.league.id)}
        sectionLabel="Failure queue"
        title={`The ${data.league.name} Press`}
      />

      <section className="grid gap-3 sm:grid-cols-4">
        <StatTile
          label="Open runs"
          tone={data.summary.total > 0 ? "amber" : "default"}
          value={`${data.summary.total}`}
        />
        <StatTile label="Judge skips" value={`${data.summary.judgeSkipped}`} />
        <StatTile label="Failed" value={`${data.summary.failed}`} />
        <StatTile
          caption={`${data.staleAfterMinutes}m threshold`}
          label="Stale pending"
          value={`${data.summary.stalePending}`}
        />
      </section>

      {data.items.length === 0 ? (
        <EmptyState
          action={
            <Link
              className={cn(buttonVariants({ variant: "outline" }))}
              href={`/leagues/${data.league.id}/press`}
            >
              Open The Press
            </Link>
          }
          icon={<FileWarning className="size-4" />}
          title="No failed generation runs"
        >
          The cast has no skipped, failed, or stale pending runs in this league.
        </EmptyState>
      ) : (
        <section aria-label="Generation failure queue" className="grid gap-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="eyebrow text-primary">Queue</p>
              <h2 className="heading-auspex text-lg">Runs requiring review</h2>
            </div>
            <AlertTriangle className="size-5 text-warning" aria-hidden />
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {data.items.map((item) => (
              <FailureQueueItemCard item={item} key={item.id} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
