"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { KVItem } from "@/components/ui/kv";
import {
  DataTable,
  type DataTableColumn,
  type DataTableSort,
  SignedValue,
} from "@/components/ui/table";
import type {
  AllTimeStandingCatalogRow,
  HeadToHeadPairCatalogEntry,
  ManagerHeadToHeadLedgerEntry,
} from "@/stats";
import {
  formatNumber,
  formatPercent,
  h2hHref,
  managerHref,
} from "./records-format";
import type {
  ManagerSeasonLine,
  RecordsLeagueSummary,
  RecordsLensInput,
} from "./records-page-data";

function compareText(left: string, right: string): number {
  return left.localeCompare(right, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function directionMultiplier(sort: DataTableSort | null): number {
  return sort?.direction === "desc" ? -1 : 1;
}

function stableResult(result: number, fallback: number): number {
  return result || fallback;
}

function recordLabel(row: {
  readonly losses: number;
  readonly ties: number;
  readonly wins: number;
}): string {
  return `${row.wins}-${row.losses}-${row.ties}`;
}

function standingMobileRow(row: AllTimeStandingCatalogRow): {
  cells: readonly KVItem[];
  id: string;
  meta: string;
  title: string;
} {
  return {
    cells: [
      { label: "W-L-T", value: recordLabel(row) },
      { label: "Win %", value: formatPercent(row.winPercentage) },
      { label: "PF", value: formatNumber(row.pointsFor) },
      { label: "Titles", value: row.championships },
      { label: "Playoffs", value: row.playoffAppearances },
    ],
    id: row.personId,
    meta: `${row.seasons} seasons · best ${row.bestSeason?.season ?? "-"}`,
    title: `#${row.rank} ${row.personName}`,
  };
}

function compareStandings(
  left: AllTimeStandingCatalogRow,
  right: AllTimeStandingCatalogRow,
  sort: DataTableSort | null,
): number {
  const direction = directionMultiplier(sort);
  let result = 0;

  switch (sort?.columnId ?? "rank") {
    case "manager":
      result = compareText(left.personName, right.personName);
      break;
    case "record":
      result =
        right.wins - left.wins ||
        left.losses - right.losses ||
        right.ties - left.ties;
      break;
    case "win-pct":
      result = right.winPercentage - left.winPercentage;
      break;
    case "points-for":
      result = right.pointsFor - left.pointsFor;
      break;
    case "titles":
      result = right.championships - left.championships;
      break;
    case "playoffs":
      result = right.playoffAppearances - left.playoffAppearances;
      break;
    default:
      result = left.rank - right.rank;
      break;
  }

  return stableResult(result * direction, left.rank - right.rank);
}

export function AllTimeStandingsTable({
  league,
  lens,
  rows,
}: {
  readonly league: RecordsLeagueSummary;
  readonly lens?: RecordsLensInput | null;
  readonly rows: readonly AllTimeStandingCatalogRow[];
}) {
  const [sort, setSort] = useState<DataTableSort | null>({
    columnId: "rank",
    direction: "asc",
  });
  const sortedRows = useMemo(
    () => [...rows].sort((left, right) => compareStandings(left, right, sort)),
    [rows, sort],
  );
  const columns: readonly DataTableColumn<AllTimeStandingCatalogRow>[] = [
    {
      cell: (row) => (
        <span className="metric text-muted-foreground">#{row.rank}</span>
      ),
      header: "#",
      id: "rank",
      sortable: true,
    },
    {
      cell: (row) => (
        <Link
          className="font-medium underline-offset-4 hover:text-primary hover:underline"
          href={managerHref(league, row.personId, lens)}
        >
          {row.personName}
        </Link>
      ),
      header: "Manager",
      id: "manager",
      sortable: true,
    },
    {
      align: "right",
      cell: (row) => <span className="metric">{recordLabel(row)}</span>,
      header: "W-L-T",
      id: "record",
      sortable: true,
    },
    {
      align: "right",
      cell: (row) => (
        <SignedValue tone="default">
          {formatPercent(row.winPercentage)}
        </SignedValue>
      ),
      header: "Win %",
      id: "win-pct",
      sortable: true,
    },
    {
      align: "right",
      cell: (row) => (
        <SignedValue tone="default">{formatNumber(row.pointsFor)}</SignedValue>
      ),
      header: "PF",
      id: "points-for",
      sortable: true,
    },
    {
      align: "right",
      cell: (row) => row.championships,
      header: "Titles",
      id: "titles",
      priority: "desktop",
      sortable: true,
    },
    {
      align: "right",
      cell: (row) => row.playoffAppearances,
      header: "Playoffs",
      id: "playoffs",
      priority: "desktop",
      sortable: true,
    },
    {
      cell: (row) =>
        row.bestSeason
          ? `${row.bestSeason.season} (${recordLabel(row.bestSeason)})`
          : "-",
      header: "Best season",
      id: "best-season",
      priority: "desktop",
    },
  ];

  return (
    <DataTable
      ariaLabel="All-time standings"
      caption="Sortable all-time manager standings"
      columns={columns}
      empty="No all-time standings have been calculated yet."
      getRowId={(row) => row.personId}
      getRowName={(row) => row.personName}
      mobileRows={sortedRows.map(standingMobileRow)}
      onSortChange={setSort}
      rows={sortedRows}
      sort={sort}
    />
  );
}

function compareSeasonLines(
  left: ManagerSeasonLine,
  right: ManagerSeasonLine,
  sort: DataTableSort | null,
): number {
  const direction = directionMultiplier(sort);
  let result = 0;

  switch (sort?.columnId ?? "season") {
    case "record":
      result =
        right.wins - left.wins ||
        left.losses - right.losses ||
        right.ties - left.ties;
      break;
    case "win-pct":
      result = right.winPercentage - left.winPercentage;
      break;
    case "points-for":
      result = right.pointsFor - left.pointsFor;
      break;
    case "points-against":
      result = right.pointsAgainst - left.pointsAgainst;
      break;
    case "luck":
      result = right.luck - left.luck;
      break;
    case "finish":
      result = left.finalRank - right.finalRank;
      break;
    default:
      result = right.season - left.season;
      break;
  }

  return stableResult(result * direction, right.season - left.season);
}

export function ManagerSeasonTable({
  rows,
}: {
  readonly rows: readonly ManagerSeasonLine[];
}) {
  const [sort, setSort] = useState<DataTableSort | null>({
    columnId: "season",
    direction: "desc",
  });
  const sortedRows = useMemo(
    () =>
      [...rows].sort((left, right) => compareSeasonLines(left, right, sort)),
    [rows, sort],
  );
  const columns: readonly DataTableColumn<ManagerSeasonLine>[] = [
    {
      cell: (row) => <span className="metric">{row.season}</span>,
      header: "Season",
      id: "season",
      sortable: true,
    },
    {
      align: "right",
      cell: (row) => <span className="metric">{recordLabel(row)}</span>,
      header: "W-L-T",
      id: "record",
      sortable: true,
    },
    {
      align: "right",
      cell: (row) => formatPercent(row.winPercentage),
      header: "Win %",
      id: "win-pct",
      sortable: true,
    },
    {
      align: "right",
      cell: (row) => formatNumber(row.pointsFor),
      header: "PF",
      id: "points-for",
      sortable: true,
    },
    {
      align: "right",
      cell: (row) => formatNumber(row.pointsAgainst),
      header: "PA",
      id: "points-against",
      priority: "desktop",
      sortable: true,
    },
    {
      align: "right",
      cell: (row) => formatNumber(row.luck),
      header: "Luck",
      id: "luck",
      priority: "desktop",
      sortable: true,
    },
    {
      cell: (row) =>
        `${row.finalPlacement.replaceAll("_", " ")} #${row.finalRank}`,
      header: "Finish",
      id: "finish",
      priority: "desktop",
      sortable: true,
    },
    {
      cell: (row) => `W${row.longestWinStreak} / L${row.longestLossStreak}`,
      header: "Streaks",
      id: "streaks",
      priority: "desktop",
    },
  ];

  return (
    <DataTable
      ariaLabel="Season by season"
      caption="Sortable manager season lines"
      columns={columns}
      empty="No season lines have been calculated yet."
      getRowId={(row) => String(row.season)}
      getRowName={(row) => `Season ${row.season}`}
      mobileRows={sortedRows.map((row) => ({
        cells: [
          { label: "Record", value: recordLabel(row) },
          { label: "Win %", value: formatPercent(row.winPercentage) },
          { label: "PF", value: formatNumber(row.pointsFor) },
          { label: "PA", value: formatNumber(row.pointsAgainst) },
          { label: "Finish", value: `#${row.finalRank}` },
        ],
        id: String(row.season),
        meta: row.finalPlacement.replaceAll("_", " "),
        title: `Season ${row.season}`,
      }))}
      onSortChange={setSort}
      rows={sortedRows}
      sort={sort}
    />
  );
}

function compareLedgers(
  left: ManagerHeadToHeadLedgerEntry,
  right: ManagerHeadToHeadLedgerEntry,
  sort: DataTableSort | null,
): number {
  const direction = directionMultiplier(sort);
  let result = 0;

  switch (sort?.columnId ?? "opponent") {
    case "series":
      result =
        right.wins - left.wins ||
        left.losses - right.losses ||
        right.ties - left.ties;
      break;
    case "points":
      result = right.pointsFor - left.pointsFor;
      break;
    case "high":
      result = right.highestScore - left.highestScore;
      break;
    case "playoff":
      result =
        right.playoffMeetings - left.playoffMeetings ||
        right.championshipMeetings - left.championshipMeetings;
      break;
    default:
      result = compareText(left.opponentName, right.opponentName);
      break;
  }

  return stableResult(
    result * direction,
    compareText(left.opponentName, right.opponentName),
  );
}

export function ManagerH2HLedgersTable({
  league,
  lens,
  managerId,
  rows,
}: {
  readonly league: RecordsLeagueSummary;
  readonly lens?: RecordsLensInput | null;
  readonly managerId: string;
  readonly rows: readonly ManagerHeadToHeadLedgerEntry[];
}) {
  const [sort, setSort] = useState<DataTableSort | null>({
    columnId: "opponent",
    direction: "asc",
  });
  const sortedRows = useMemo(
    () => [...rows].sort((left, right) => compareLedgers(left, right, sort)),
    [rows, sort],
  );
  const columns: readonly DataTableColumn<ManagerHeadToHeadLedgerEntry>[] = [
    {
      cell: (row) => (
        <Link
          className="font-medium underline-offset-4 hover:text-primary hover:underline"
          href={h2hHref(league, managerId, row.opponentPersonId, lens)}
        >
          {row.opponentName}
        </Link>
      ),
      header: "Opponent",
      id: "opponent",
      sortable: true,
    },
    {
      align: "right",
      cell: (row) => <span className="metric">{recordLabel(row)}</span>,
      header: "Series",
      id: "series",
      sortable: true,
    },
    {
      align: "right",
      cell: (row) =>
        `${formatNumber(row.pointsFor)} / ${formatNumber(row.pointsAgainst)}`,
      header: "Points",
      id: "points",
      sortable: true,
    },
    {
      align: "right",
      cell: (row) => formatNumber(row.highestScore),
      header: "High",
      id: "high",
      priority: "desktop",
      sortable: true,
    },
    {
      align: "right",
      cell: (row) => `${row.playoffMeetings} / ${row.championshipMeetings}`,
      header: "Playoff",
      id: "playoff",
      priority: "desktop",
      sortable: true,
    },
    {
      cell: (row) =>
        row.lastSeason
          ? `${row.lastSeason} W${row.lastScoringPeriod ?? "?"}`
          : "-",
      header: "Last",
      id: "last",
      priority: "desktop",
    },
  ];

  return (
    <DataTable
      ariaLabel="Head-to-head ledgers"
      caption="Sortable head-to-head manager ledgers"
      columns={columns}
      empty="No head-to-head ledgers have been calculated yet."
      getRowId={(row) => row.opponentPersonId}
      getRowName={(row) => row.opponentName}
      mobileRows={sortedRows.map((row) => ({
        cells: [
          { label: "Series", value: recordLabel(row) },
          {
            label: "Points",
            value: `${formatNumber(row.pointsFor)} / ${formatNumber(row.pointsAgainst)}`,
          },
          { label: "High", value: formatNumber(row.highestScore) },
          {
            label: "Playoff",
            value: `${row.playoffMeetings} / ${row.championshipMeetings}`,
          },
        ],
        id: row.opponentPersonId,
        meta: row.lastSeason
          ? `Last ${row.lastSeason} W${row.lastScoringPeriod ?? "?"}`
          : "No last meeting",
        title: row.opponentName,
      }))}
      onSortChange={setSort}
      rows={sortedRows}
      sort={sort}
    />
  );
}

function compareSeasonPairs(
  left: HeadToHeadPairCatalogEntry,
  right: HeadToHeadPairCatalogEntry,
  sort: DataTableSort | null,
): number {
  const direction = directionMultiplier(sort);
  let result = 0;

  switch (sort?.columnId ?? "season") {
    case "person-a":
      result = right.personA.wins - left.personA.wins;
      break;
    case "person-b":
      result = right.personB.wins - left.personB.wins;
      break;
    case "points":
      result =
        right.personA.points +
        right.personB.points -
        (left.personA.points + left.personB.points);
      break;
    case "playoff":
      result =
        right.playoffMeetings - left.playoffMeetings ||
        right.championshipMeetings - left.championshipMeetings;
      break;
    default:
      result = right.season - left.season;
      break;
  }

  return stableResult(result * direction, right.season - left.season);
}

export function H2HSeasonPairsTable({
  personAName,
  personBName,
  rows,
}: {
  readonly personAName: string;
  readonly personBName: string;
  readonly rows: readonly HeadToHeadPairCatalogEntry[];
}) {
  const [sort, setSort] = useState<DataTableSort | null>({
    columnId: "season",
    direction: "desc",
  });
  const sortedRows = useMemo(
    () =>
      [...rows].sort((left, right) => compareSeasonPairs(left, right, sort)),
    [rows, sort],
  );
  const columns: readonly DataTableColumn<HeadToHeadPairCatalogEntry>[] = [
    {
      cell: (row) => <span className="metric">{row.season}</span>,
      header: "Season",
      id: "season",
      sortable: true,
    },
    {
      align: "right",
      cell: (row) => `${row.personA.wins}-${row.personA.losses}`,
      header: personAName,
      id: "person-a",
      sortable: true,
    },
    {
      align: "right",
      cell: (row) => `${row.personB.wins}-${row.personB.losses}`,
      header: personBName,
      id: "person-b",
      sortable: true,
    },
    {
      align: "right",
      cell: (row) => row.ties,
      header: "Ties",
      id: "ties",
    },
    {
      align: "right",
      cell: (row) =>
        `${formatNumber(row.personA.points)} / ${formatNumber(row.personB.points)}`,
      header: "Points",
      id: "points",
      priority: "desktop",
      sortable: true,
    },
    {
      align: "right",
      cell: (row) => `${row.playoffMeetings} / ${row.championshipMeetings}`,
      header: "Playoff",
      id: "playoff",
      priority: "desktop",
      sortable: true,
    },
  ];

  return (
    <DataTable
      ariaLabel="Season ledgers"
      caption="Sortable head-to-head season ledgers"
      columns={columns}
      empty="No season ledgers have been calculated yet."
      getRowId={(row) => String(row.season)}
      getRowName={(row) => `Season ${row.season}`}
      mobileRows={sortedRows.map((row) => ({
        cells: [
          {
            label: personAName,
            value: `${row.personA.wins}-${row.personA.losses}`,
          },
          {
            label: personBName,
            value: `${row.personB.wins}-${row.personB.losses}`,
          },
          { label: "Ties", value: row.ties },
          {
            label: "Points",
            value: `${formatNumber(row.personA.points)} / ${formatNumber(row.personB.points)}`,
          },
        ],
        id: String(row.season),
        meta: `${row.playoffMeetings} playoff · ${row.championshipMeetings} title`,
        title: `Season ${row.season}`,
      }))}
      onSortChange={setSort}
      rows={sortedRows}
      sort={sort}
    />
  );
}
