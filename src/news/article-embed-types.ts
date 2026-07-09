export type PublicationArticleTextBodyBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "quote"; text: string }
  | { type: "list"; ordered: boolean; items: string[] };

export interface PublicationArticleScoreboardMatchup {
  awayLabel: string;
  awayScore: number;
  homeLabel: string;
  homeScore: number;
  id: string;
  kickoffLabel: string;
  status: "final" | "live" | "stale" | "upcoming";
  winProbability: number;
}

export interface PublicationArticleScoreboardEmbed {
  id: string;
  kind: "scoreboard_strip";
  matchups: PublicationArticleScoreboardMatchup[];
  scoringPeriod: number | null;
  season: number;
  title: string;
}

export interface PublicationArticleStandingsMovementRow {
  delta: number;
  id: string;
  managerNames: string[];
  pointsFor: number;
  previousRank: number | null;
  rank: number;
  record: string;
  team: string;
}

export interface PublicationArticleStandingsMovementEmbed {
  id: string;
  kind: "standings_movement";
  rows: PublicationArticleStandingsMovementRow[];
  season: number;
  title: string;
}

export interface PublicationArticleH2HPoint {
  label: string;
  personAScore: number;
  personBScore: number;
  resultForA: "loss" | "tie" | "win";
}

export interface PublicationArticleH2HSparklineEmbed {
  id: string;
  kind: "h2h_sparkline";
  personAName: string;
  personBName: string;
  points: PublicationArticleH2HPoint[];
  season: number | null;
  title: string;
}

export interface PublicationArticleUnknownEmbed {
  id: string;
  kind: "unknown";
}

export type PublicationArticleEmbed =
  | PublicationArticleH2HSparklineEmbed
  | PublicationArticleScoreboardEmbed
  | PublicationArticleStandingsMovementEmbed
  | PublicationArticleUnknownEmbed;

export type PublicationArticleBodyBlock =
  | PublicationArticleTextBodyBlock
  | { embed: PublicationArticleEmbed; type: "embed" };
