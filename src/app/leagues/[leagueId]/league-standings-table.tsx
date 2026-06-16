"use client";

import { useMemo, useState } from "react";
import { Edge } from "@/components/ui/edge";
import type { KVItem } from "@/components/ui/kv";
import { Ladder } from "@/components/ui/ladder";
import {
  DataTable,
  type DataTableColumn,
  type DataTableSort,
  SignedValue,
} from "@/components/ui/table";
import type { LeagueHomeStanding } from "@/home/league-home";

function formatPoints(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value);
}

function formatGamesBack(value: number): string {
  if (value === 0) {
    return "-";
  }
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function recordLabel(row: LeagueHomeStanding): string {
  return `${row.wins}-${row.losses}-${row.ties}`;
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function compareRows(
  left: LeagueHomeStanding,
  right: LeagueHomeStanding,
  sort: DataTableSort | null,
): number {
  const direction = sort?.direction === "desc" ? -1 : 1;
  const columnId = sort?.columnId ?? "rank";
  let result = 0;

  switch (columnId) {
    case "team":
      result = compareText(left.name, right.name);
      break;
    case "record":
      result =
        right.wins - left.wins ||
        left.losses - right.losses ||
        right.ties - left.ties;
      break;
    case "points-for":
      result = right.pointsFor - left.pointsFor;
      break;
    case "points-against":
      result = right.pointsAgainst - left.pointsAgainst;
      break;
    case "games-back":
      result = left.gamesBack - right.gamesBack;
      break;
    default:
      result = left.rank - right.rank;
      break;
  }

  return (
    result * direction ||
    left.rank - right.rank ||
    compareText(left.name, right.name)
  );
}

function mobileRow(row: LeagueHomeStanding): {
  cells: readonly KVItem[];
  id: string;
  meta: string;
  selected?: boolean;
  title: string;
} {
  return {
    cells: [
      { label: "Record", value: recordLabel(row) },
      { label: "PF", value: formatPoints(row.pointsFor) },
      { label: "PA", value: formatPoints(row.pointsAgainst) },
      { label: "GB", value: formatGamesBack(row.gamesBack) },
    ],
    id: row.id,
    meta: row.managerNames.join(", "),
    selected: row.isClaimedByUser,
    title: `#${row.rank} ${row.name}`,
  };
}

function TeamCell({ row }: { row: LeagueHomeStanding }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span
        aria-hidden="true"
        className="chip-glyph flex size-9 shrink-0 items-center justify-center text-xs"
      >
        {row.abbrev.slice(0, 3)}
      </span>
      <div className="min-w-0">
        <p className="truncate font-medium">
          {row.name}
          {row.isClaimedByUser ? (
            <span className="ml-2 rounded-full border border-primary/50 bg-primary/10 px-2 py-0.5 align-middle text-xs font-semibold text-primary">
              You
            </span>
          ) : null}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {row.managerNames.join(", ")}
        </p>
      </div>
    </div>
  );
}

export function LeagueStandingsTable({
  rows,
}: {
  rows: readonly LeagueHomeStanding[];
}) {
  const [sort, setSort] = useState<DataTableSort | null>({
    columnId: "rank",
    direction: "asc",
  });
  const sortedRows = useMemo(
    () => [...rows].sort((left, right) => compareRows(left, right, sort)),
    [rows, sort],
  );
  const selectedRowIds = sortedRows
    .filter((row) => row.isClaimedByUser)
    .map((row) => row.id);
  const playoffLine = rows.find((row) => row.playoffLineAfter);
  const columns: readonly DataTableColumn<LeagueHomeStanding>[] = [
    {
      cell: (row) => (
        <div>
          <p className="metric text-muted-foreground">#{row.rank}</p>
          <Edge className="mt-1" tone="neutral" value="even" />
        </div>
      ),
      header: "#",
      id: "rank",
      sortable: true,
    },
    {
      cell: (row) => <TeamCell row={row} />,
      header: "Team",
      id: "team",
      sortable: true,
    },
    {
      align: "right",
      cell: (row) => (
        <span className="metric text-foreground">{recordLabel(row)}</span>
      ),
      header: "W-L-T",
      id: "record",
      sortable: true,
    },
    {
      align: "right",
      cell: (row) => (
        <SignedValue className="font-semibold" tone="default">
          {formatPoints(row.pointsFor)}
        </SignedValue>
      ),
      header: "PF",
      id: "points-for",
      sortable: true,
    },
    {
      align: "right",
      cell: (row) => (
        <SignedValue tone="muted">
          {formatPoints(row.pointsAgainst)}
        </SignedValue>
      ),
      header: "PA",
      id: "points-against",
      priority: "desktop",
      sortable: true,
    },
    {
      align: "right",
      cell: (row) => (
        <SignedValue tone="muted">{formatGamesBack(row.gamesBack)}</SignedValue>
      ),
      header: "GB",
      id: "games-back",
      priority: "desktop",
      sortable: true,
    },
  ];

  if (rows.length === 0) {
    return (
      <div className="cell p-4 text-sm text-muted-foreground">
        No standings rows have been ingested yet.
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <DataTable
        ariaLabel="League standings"
        caption="Sortable league standings"
        className="hidden sm:grid"
        columns={columns}
        empty={
          <p className="rounded-control border border-dashed border-border bg-elevated px-3 py-3 text-sm text-muted-foreground">
            No standings rows have been ingested yet.
          </p>
        }
        getRowId={(row) => row.id}
        getRowName={(row) => row.name}
        mobileRows={sortedRows.map(mobileRow)}
        onSortChange={setSort}
        rows={sortedRows}
        selectedRowIds={selectedRowIds}
        sort={sort}
      />
      <div className="sm:hidden">
        <Ladder
          label="Standings ladder"
          pips={sortedRows.map((row) => ({
            id: row.id,
            isCurrent: row.isClaimedByUser,
            label: `${row.name} ${recordLabel(row)}`,
            rank: row.rank,
          }))}
        />
      </div>
      {playoffLine ? (
        <p className="rounded-control border border-warning/40 bg-warning/10 px-3 py-2 text-center text-xs font-medium text-warning">
          Playoff line after rank {playoffLine.rank}
        </p>
      ) : null}
    </div>
  );
}
