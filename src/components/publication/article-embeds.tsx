import { LineChart, ListOrdered } from "lucide-react";
import type { ReactNode } from "react";
import { ScoreboardStrip } from "@/components/ui/spectacle";
import { cn } from "@/lib/utils";
import type {
  PublicationArticleEmbed,
  PublicationArticleH2HPoint,
  PublicationArticleH2HSparklineEmbed,
  PublicationArticleStandingsMovementEmbed,
  PublicationArticleStandingsMovementRow,
} from "@/news/article-embed-types";

function formatPoints(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value);
}

function deltaLabel(value: number): string {
  if (value === 0) {
    return "even";
  }
  return `${value > 0 ? "+" : ""}${value}`;
}

function deltaClassName(value: number): string {
  if (value > 0) {
    return "text-positive";
  }
  if (value < 0) {
    return "text-negative";
  }
  return "text-muted-foreground";
}

function ArticleEmbedShell({
  children,
  icon,
  kind,
  title,
}: {
  readonly children: ReactNode;
  readonly icon: React.ReactNode;
  readonly kind: PublicationArticleEmbed["kind"];
  readonly title: string;
}) {
  return (
    <figure
      aria-label={title}
      className="not-prose my-5 grid gap-3 rounded-control border border-primary/25 bg-primary/5 p-3 shadow-[var(--bevel)] sm:p-4"
      data-article-embed-kind={kind}
      data-slot="article-embed"
    >
      <header className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="chip-glyph flex size-8 shrink-0 items-center justify-center">
            {icon}
          </span>
          <figcaption className="min-w-0">
            <p className="eyebrow text-primary">Live embed</p>
            <h3 className="heading-auspex truncate text-sm">{title}</h3>
          </figcaption>
        </div>
      </header>
      {children}
    </figure>
  );
}

function ArticleScoreboardEmbed({
  embed,
}: {
  readonly embed: Extract<
    PublicationArticleEmbed,
    { kind: "scoreboard_strip" }
  >;
}) {
  return (
    <div
      className="not-prose my-5"
      data-article-embed-kind={embed.kind}
      data-slot="article-embed"
    >
      <ScoreboardStrip
        aria-label={embed.title}
        matchups={embed.matchups}
        motion="off"
        nextKickoffLabel={
          embed.scoringPeriod
            ? `Week ${embed.scoringPeriod} matchups are still importing`
            : "Matchups are still importing"
        }
      />
    </div>
  );
}

function StandingsMovementRow({
  row,
}: {
  readonly row: PublicationArticleStandingsMovementRow;
}) {
  return (
    <li className="grid min-h-12 grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-3 rounded-control border border-input bg-[var(--panel)] px-3 py-2">
      <div>
        <p className="metric text-primary">#{row.rank}</p>
        <p className={cn("metric text-xs", deltaClassName(row.delta))}>
          {deltaLabel(row.delta)}
        </p>
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">
          {row.team}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {row.managerNames.join(", ")}
        </p>
      </div>
      <div className="text-right">
        <p className="metric text-sm text-foreground">{row.record}</p>
        <p className="metric text-xs text-muted-foreground">
          {formatPoints(row.pointsFor)} PF
        </p>
      </div>
    </li>
  );
}

function ArticleStandingsMovementEmbed({
  embed,
}: {
  readonly embed: PublicationArticleStandingsMovementEmbed;
}) {
  return (
    <ArticleEmbedShell
      icon={<ListOrdered className="size-4 text-primary" aria-hidden="true" />}
      kind={embed.kind}
      title={embed.title}
    >
      {embed.rows.length > 0 ? (
        <ol className="grid gap-2">
          {embed.rows.map((row) => (
            <StandingsMovementRow key={row.id} row={row} />
          ))}
        </ol>
      ) : (
        <p className="rounded-control border border-dashed border-input px-3 py-3 text-sm text-muted-foreground">
          Standings rows are still importing.
        </p>
      )}
    </ArticleEmbedShell>
  );
}

function sparklinePoints(
  points: readonly PublicationArticleH2HPoint[],
  selector: (point: PublicationArticleH2HPoint) => number,
): string {
  const maxScore = Math.max(
    1,
    ...points.flatMap((point) => [point.personAScore, point.personBScore]),
  );
  const step = points.length <= 1 ? 100 : 100 / (points.length - 1);
  return points
    .map((point, index) => {
      const x = Math.round(index * step * 100) / 100;
      const y =
        Math.round((42 - (selector(point) / maxScore) * 34) * 100) / 100;
      return `${x},${y}`;
    })
    .join(" ");
}

function resultClassName(result: PublicationArticleH2HPoint["resultForA"]) {
  switch (result) {
    case "win":
      return "text-positive";
    case "loss":
      return "text-negative";
    default:
      return "text-muted-foreground";
  }
}

function ArticleH2HSparklineEmbed({
  embed,
}: {
  readonly embed: PublicationArticleH2HSparklineEmbed;
}) {
  const pointsA = sparklinePoints(embed.points, (point) => point.personAScore);
  const pointsB = sparklinePoints(embed.points, (point) => point.personBScore);

  return (
    <ArticleEmbedShell
      icon={<LineChart className="size-4 text-primary" aria-hidden="true" />}
      kind={embed.kind}
      title={embed.title}
    >
      {embed.points.length > 0 ? (
        <div className="grid gap-3">
          <svg
            aria-label={`${embed.personAName} and ${embed.personBName} head-to-head scoring`}
            className="h-28 w-full overflow-visible rounded-control border border-input bg-[var(--panel)] p-3"
            preserveAspectRatio="none"
            role="img"
            viewBox="0 0 100 44"
          >
            <polyline
              fill="none"
              points={pointsB}
              stroke="var(--steel)"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
            <polyline
              fill="none"
              points={pointsA}
              stroke="var(--lilac)"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.4"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <div className="grid gap-2 sm:grid-cols-2">
            <p className="rounded-control border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-primary">
              {embed.personAName}
            </p>
            <p className="rounded-control border border-steel/30 bg-steel/10 px-3 py-2 text-xs text-steel">
              {embed.personBName}
            </p>
          </div>
          <ol className="grid gap-1">
            {embed.points.slice(-4).map((point) => (
              <li
                className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 text-xs"
                key={point.label}
              >
                <span className="truncate text-muted-foreground">
                  {point.label}
                </span>
                <span
                  className={cn("metric", resultClassName(point.resultForA))}
                >
                  {formatPoints(point.personAScore)}-
                  {formatPoints(point.personBScore)}
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <p className="rounded-control border border-dashed border-input px-3 py-3 text-sm text-muted-foreground">
          Head-to-head rows are still importing.
        </p>
      )}
    </ArticleEmbedShell>
  );
}

function ArticleEmbedBlock({
  embed,
}: {
  readonly embed: PublicationArticleEmbed;
}) {
  switch (embed.kind) {
    case "scoreboard_strip":
      return <ArticleScoreboardEmbed embed={embed} />;
    case "standings_movement":
      return <ArticleStandingsMovementEmbed embed={embed} />;
    case "h2h_sparkline":
      return <ArticleH2HSparklineEmbed embed={embed} />;
    case "unknown":
      return null;
  }
}

export { ArticleEmbedBlock };
