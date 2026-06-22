"use client";

import { ArrowLeft, BookOpen, Database, Users } from "lucide-react";
import { useMemo, useState } from "react";
import {
  PublicationMasthead,
  type PublicationNavItem,
} from "@/components/publication/front-view";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/select";
import { StatusPill, type StatusTone } from "@/components/ui/status-pill";
import {
  DataTable,
  type DataTableColumn,
  SignedValue,
} from "@/components/ui/table";
import type {
  DataBookGrain,
  DataBookPageData,
  DataBookPersonRow,
  DataBookSeason,
  DataBookSettingRow,
  DataBookWeekRow,
} from "./data-book-data";

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

const peopleColumns: readonly DataTableColumn<DataBookPersonRow>[] = [
  {
    cell: (row) => (
      <span className="font-medium text-foreground">{row.personName}</span>
    ),
    header: "Person",
    id: "person",
  },
  {
    cell: (row) => row.teamName,
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

const weekColumns: readonly DataTableColumn<DataBookWeekRow>[] = [
  {
    cell: (row) => <span className="metric">W{row.scoringPeriod}</span>,
    header: "Week",
    id: "week",
  },
  {
    cell: (row) => (
      <div className="grid gap-0.5">
        <span className="font-medium text-foreground">{row.managerName}</span>
        <span className="text-xs text-muted-foreground">{row.teamName}</span>
      </div>
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

function PeopleTable({ season }: { season: DataBookSeason }) {
  return (
    <DataTable
      ariaLabel={`${season.season} Data Book people`}
      caption="People and team names for the selected season"
      columns={peopleColumns}
      empty="No people or team-season rows have been imported for this season."
      getRowId={(row) => row.id}
      getRowName={(row) => row.personName}
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

function WeeksTable({ season }: { season: DataBookSeason }) {
  return (
    <DataTable
      ariaLabel={`${season.season} Data Book weeks`}
      caption="Team-week matchup facts for the selected season"
      columns={weekColumns}
      empty="No weekly facts have been materialized for this season."
      getRowId={(row) => row.id}
      getRowName={(row) => `${row.managerName} week ${row.scoringPeriod}`}
      rows={season.weeks}
    />
  );
}

function ActiveGrain({
  activeGrain,
  season,
}: {
  activeGrain: DataBookGrain;
  season: DataBookSeason;
}) {
  switch (activeGrain) {
    case "people":
      return <PeopleTable season={season} />;
    case "settings":
      return <SettingsTable season={season} />;
    case "weeks":
      return <WeeksTable season={season} />;
  }
}

export function DataBookView({ data }: { data: DataBookPageData }) {
  const [activeGrain, setActiveGrain] = useState<DataBookGrain>("people");
  const initialSeason = data.seasons[0]?.season ?? data.league.season;
  const [selectedSeason, setSelectedSeason] = useState(initialSeason);
  const season = selectedSeasonOrFallback(data.seasons, selectedSeason);
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
            href: `/leagues/${data.league.id}`,
            icon: <ArrowLeft data-icon="inline-start" />,
            label: "League home",
          },
          {
            href: `/leagues/${data.league.id}/records`,
            icon: <BookOpen data-icon="inline-start" />,
            label: "Records",
          },
        ]}
        controls={
          <SeasonControl
            onSeasonChange={setSelectedSeason}
            season={season}
            seasons={data.seasons}
          />
        }
        deck={`${data.league.provider.toUpperCase()} ${data.league.providerLeagueId}. Live draft tables for data curation, displayed one season at a time.`}
        eyebrow="DATA BOOK"
        navAriaLabel="Data Book grains"
        navItems={navItems}
        sectionLabel={`${season.season} season`}
        title={`${data.league.name} Data Book`}
      />

      {data.seasons.length === 0 ? (
        <EmptyState className="p-5" title="No league data imported yet">
          Import history to populate the Data Book tables.
        </EmptyState>
      ) : (
        <section className="grid gap-4" aria-live="polite">
          <GrainSummary activeGrain={activeGrain} season={season} />
          <ActiveGrain activeGrain={activeGrain} season={season} />
        </section>
      )}
    </main>
  );
}
