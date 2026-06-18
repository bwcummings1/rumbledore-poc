import type {
  CurrentRecordBookEntry,
  HeadToHeadMeeting,
  ManagerWeeklyHighlight,
  RecordsLeagueSummary,
  RecordsLensInput,
} from "./records-page-data";

export function formatNumber(value: number, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits,
    minimumFractionDigits: Number.isInteger(value)
      ? 0
      : Math.min(2, maximumFractionDigits),
  }).format(value);
}

export function formatPercent(value: number): string {
  return `${formatNumber(value * 100, 1)}%`;
}

export function formatRecordValue(record: CurrentRecordBookEntry): string {
  if (record.recordType === "best_career_win_percentage") {
    return formatPercent(record.value);
  }
  return formatNumber(record.value);
}

export function formatRecordContext(record: CurrentRecordBookEntry): string {
  const pieces = [
    record.holderName ?? "Unknown holder",
    record.opponentName ? `vs ${record.opponentName}` : null,
    record.season ? String(record.season) : null,
    record.scoringPeriod ? `Week ${record.scoringPeriod}` : null,
  ].filter((piece): piece is string => Boolean(piece));

  return pieces.join(" - ");
}

export function formatWeekContext(
  row: Pick<
    ManagerWeeklyHighlight,
    "opponentName" | "scoringPeriod" | "season"
  >,
): string {
  return [
    row.opponentName ? `vs ${row.opponentName}` : null,
    row.season,
    `Week ${row.scoringPeriod}`,
  ]
    .filter(Boolean)
    .join(" - ");
}

export function formatMeetingContext(row: HeadToHeadMeeting): string {
  const labels = [
    row.season,
    `Week ${row.scoringPeriod}`,
    row.championship ? "title game" : row.playoff ? "playoff" : null,
  ].filter(Boolean);
  return labels.join(" - ");
}

function lensQuery(lens?: RecordsLensInput | null): string {
  const params = new URLSearchParams();
  if (lens?.segment && lens.segment !== "both") {
    params.set("segment", lens.segment);
  }
  if (lens?.groupingId) {
    params.set("grouping", lens.groupingId);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function leagueRecordsHref(
  league: Pick<RecordsLeagueSummary, "id">,
  lens?: RecordsLensInput | null,
): string {
  return `/leagues/${league.id}/records${lensQuery(lens)}`;
}

export function managerHref(
  league: Pick<RecordsLeagueSummary, "id">,
  personId: string,
  lens?: RecordsLensInput | null,
): string {
  return `/leagues/${league.id}/records/managers/${personId}${lensQuery(lens)}`;
}

export function h2hHref(
  league: Pick<RecordsLeagueSummary, "id">,
  personAId: string,
  personBId: string,
  lens?: RecordsLensInput | null,
): string {
  return `/leagues/${league.id}/records/h2h/${personAId}/${personBId}${lensQuery(lens)}`;
}
