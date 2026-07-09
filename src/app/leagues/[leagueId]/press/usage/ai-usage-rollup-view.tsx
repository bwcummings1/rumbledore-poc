import { ArrowLeft, Gauge, Newspaper, ReceiptText } from "lucide-react";
import Link from "next/link";
import type {
  AiUsageRollupData,
  AiUsageWeeklyBreakdown,
  AiUsageWeeklyRollup,
} from "@/ai";
import {
  PublicationMasthead,
  type PublicationNavItem,
} from "@/components/publication/front-view";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { KVList } from "@/components/ui/kv";
import { StatTile } from "@/components/ui/stat-tile";
import { StatusPill } from "@/components/ui/status-pill";
import { cn } from "@/lib/utils";
import { LEAGUE_PUBLICATION_SECTIONS } from "@/news";

const NUMBER_FORMATTER = new Intl.NumberFormat("en-US");
const UTC_FORMATTER = new Intl.DateTimeFormat("en-US", {
  day: "2-digit",
  month: "short",
  timeZone: "UTC",
  year: "numeric",
});
const TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  day: "2-digit",
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
  month: "short",
  timeZone: "UTC",
});

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
      href: `/leagues/${leagueId}/press/usage`,
      icon: <Gauge aria-hidden="true" className="size-4" />,
      label: "AI Usage",
    },
  ];
}

function formatCount(value: number): string {
  return NUMBER_FORMATTER.format(value);
}

function formatCost(microsUsd: number): string {
  return `$${(microsUsd / 1_000_000).toFixed(6)}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? UTC_FORMATTER.format(date) : "n/a";
}

function formatTimestamp(value: string | null): string {
  if (!value) {
    return "No calls";
  }
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? `${TIME_FORMATTER.format(date)} UTC`
    : "n/a";
}

function personaLabel(value: string): string {
  return value.replaceAll("_", " ");
}

function WeeklyBreakdownTable({
  rows,
}: {
  readonly rows: readonly AiUsageWeeklyBreakdown[];
}) {
  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[42rem] text-left text-sm">
        <thead className="border-b border-[var(--hair)] text-xs uppercase tracking-[0.12em] text-ink-3">
          <tr>
            <th className="py-2 pr-3 font-mono font-medium">Persona</th>
            <th className="py-2 pr-3 font-mono font-medium">Content</th>
            <th className="py-2 pr-3 font-mono font-medium">Model</th>
            <th className="py-2 pr-3 text-right font-mono font-medium">
              Calls
            </th>
            <th className="py-2 pr-3 text-right font-mono font-medium">
              Tokens
            </th>
            <th className="py-2 text-right font-mono font-medium">Cost</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--hair)]">
          {rows.map((row) => (
            <tr
              key={`${row.weekStart}:${row.persona}:${row.contentType}:${row.provider}:${row.model}`}
            >
              <td className="py-2 pr-3 capitalize text-foreground">
                {personaLabel(row.persona)}
              </td>
              <td className="py-2 pr-3 text-muted-foreground">
                {row.contentTypeLabel}
              </td>
              <td className="py-2 pr-3">
                <span className="rounded-control border border-[var(--hair)] px-2 py-1 font-mono text-xs text-ink-3">
                  {row.provider}/{row.model}
                </span>
              </td>
              <td className="py-2 pr-3 text-right text-foreground">
                {formatCount(row.callCount)}
              </td>
              <td className="py-2 pr-3 text-right text-foreground">
                {formatCount(row.totalTokens)}
              </td>
              <td className="py-2 text-right text-foreground">
                {formatCost(row.totalCostMicrosUsd)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WeeklyUsageCard({
  breakdown,
  week,
}: {
  readonly breakdown: readonly AiUsageWeeklyBreakdown[];
  readonly week: AiUsageWeeklyRollup;
}) {
  return (
    <article className="cell grid gap-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow text-primary">Week of</p>
          <h2 className="heading-auspex text-lg">
            {formatDate(week.weekStart)}
          </h2>
        </div>
        <StatusPill tone="info">
          {formatCount(week.estimatedCallCount)} estimated
        </StatusPill>
      </div>
      <KVList
        items={[
          { label: "Calls", value: formatCount(week.callCount) },
          { label: "Tokens", value: formatCount(week.totalTokens) },
          {
            label: "Mock cost",
            tone: "money",
            value: formatCost(week.totalCostMicrosUsd),
          },
        ]}
      />
      <WeeklyBreakdownTable rows={breakdown} />
    </article>
  );
}

export function AiUsageRollupView({
  data,
}: {
  readonly data: AiUsageRollupData;
}) {
  const breakdownByWeek = new Map<string, AiUsageWeeklyBreakdown[]>();
  for (const row of data.weeklyBreakdown) {
    const rows = breakdownByWeek.get(row.weekStart) ?? [];
    rows.push(row);
    breakdownByWeek.set(row.weekStart, rows);
  }

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
        deck={`${data.league.season} ${data.league.provider.toUpperCase()} fantasy football. League-scoped LLM generation calls, token estimates, and mock-cost attribution before any real-key spend is enabled.`}
        eyebrow="EDITORIAL CONTROL"
        navAriaLabel="Press sections"
        navItems={leaguePressNavItems(data.league.id)}
        sectionLabel="AI usage"
        title={`The ${data.league.name} Press`}
      />

      <section className="grid gap-3 sm:grid-cols-4">
        <StatTile label="Calls" value={formatCount(data.summary.callCount)} />
        <StatTile
          label="Tokens"
          value={formatCount(data.summary.totalTokens)}
        />
        <StatTile
          label="Estimated"
          value={formatCount(data.summary.estimatedCallCount)}
        />
        <StatTile
          label="Mock cost"
          tone="amber"
          value={formatCost(data.summary.totalCostMicrosUsd)}
        />
      </section>

      <section className="cell grid gap-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="eyebrow text-primary">Ledger window</p>
            <h2 className="heading-auspex text-lg">League attribution</h2>
          </div>
          <StatusPill tone="neutral">mock pricing</StatusPill>
        </div>
        <KVList
          items={[
            {
              label: "First call",
              value: formatTimestamp(data.summary.firstCallAt),
            },
            {
              label: "Last call",
              value: formatTimestamp(data.summary.lastCallAt),
            },
            { label: "Generated", value: formatTimestamp(data.generatedAt) },
          ]}
        />
      </section>

      {data.weekly.length === 0 ? (
        <EmptyState
          action={
            <Link
              className={cn(buttonVariants({ variant: "outline" }))}
              href={`/leagues/${data.league.id}/press`}
            >
              Open The Press
            </Link>
          }
          icon={<ReceiptText className="size-4" />}
          title="No AI usage recorded"
        >
          New league blog generation attempts will append token attribution rows
          here.
        </EmptyState>
      ) : (
        <section aria-label="Weekly AI usage rollup" className="grid gap-3">
          <div>
            <p className="eyebrow text-primary">Weekly rollup</p>
            <h2 className="heading-auspex text-lg">League x week usage</h2>
          </div>
          <div className="grid gap-3">
            {data.weekly.map((week) => (
              <WeeklyUsageCard
                breakdown={breakdownByWeek.get(week.weekStart) ?? []}
                key={week.weekStart}
                week={week}
              />
            ))}
          </div>
        </section>
      )}

      {data.recentCalls.length > 0 ? (
        <section aria-label="Recent AI usage calls" className="grid gap-3">
          <div>
            <p className="eyebrow text-primary">Recent calls</p>
            <h2 className="heading-auspex text-lg">Per-call rows</h2>
          </div>
          <div className="overflow-x-auto rounded-card border border-[var(--hair)] bg-elevated/40">
            <table className="w-full min-w-[52rem] text-left text-sm">
              <thead className="border-b border-[var(--hair)] text-xs uppercase tracking-[0.12em] text-ink-3">
                <tr>
                  <th className="px-3 py-2 font-mono font-medium">Time</th>
                  <th className="px-3 py-2 font-mono font-medium">Persona</th>
                  <th className="px-3 py-2 font-mono font-medium">Content</th>
                  <th className="px-3 py-2 font-mono font-medium">Model</th>
                  <th className="px-3 py-2 text-right font-mono font-medium">
                    Tokens
                  </th>
                  <th className="px-3 py-2 text-right font-mono font-medium">
                    Cost
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--hair)]">
                {data.recentCalls.map((call) => (
                  <tr key={call.id}>
                    <td className="px-3 py-2 text-muted-foreground">
                      {formatTimestamp(call.createdAt)}
                    </td>
                    <td className="px-3 py-2 capitalize text-foreground">
                      {personaLabel(call.persona)}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {call.contentTypeLabel}
                    </td>
                    <td className="px-3 py-2">
                      <span className="rounded-control border border-[var(--hair)] px-2 py-1 font-mono text-xs text-ink-3">
                        {call.provider}/{call.model}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-foreground">
                      {formatCount(call.totalTokens)}
                    </td>
                    <td className="px-3 py-2 text-right text-foreground">
                      {formatCost(call.costMicrosUsd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </main>
  );
}
