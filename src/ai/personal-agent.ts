import { and, asc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import { leagues, loreClaims } from "@/db/schema";
import type {
  EntitlementResolution,
  EntitlementResolverEnv,
} from "@/entitlements";
import { resolveEntitlement } from "@/entitlements";
import {
  getYourLeaguesLandingData,
  type YourLeagueCard,
  type YourLeagueMatchup,
  type YourLeagueMatchupSide,
} from "@/home/your-leagues";
import {
  type CanonCatalog,
  getLeagueCanonRecordsContext,
  type ManagerChampionshipRecord,
  type RecordBookSegment,
  type RecordsGroupingOption,
  type RecordsLensInput,
} from "@/stats";

export interface PersonalAgentBriefingInput {
  readonly db: Db;
  readonly env: EntitlementResolverEnv;
  readonly loadLandingData?: typeof getYourLeaguesLandingData;
  readonly now?: () => Date;
  readonly userId: string;
}

export interface PersonalAgentPageContext {
  readonly leagueId?: string | null;
  readonly pathname?: string;
  readonly scope?: "arena" | "global" | "league" | "news";
  readonly sectionId?: string | null;
}

export type PersonalAgentAnswerResult =
  | PersonalAgentAnswerBlocked
  | PersonalAgentAnswerReady;

export interface PersonalAgentAnswerBlocked {
  readonly entitlement: EntitlementResolution;
  readonly status: "blocked";
}

export interface PersonalAgentAnswerReady {
  readonly answer: PersonalAgentAnswer;
  readonly entitlement: EntitlementResolution;
  readonly status: "ready";
}

export interface PersonalAgentAnswer {
  readonly citations: PersonalAgentCitation[];
  readonly generatedAt: string;
  readonly question: string;
  readonly scope: PersonalAgentAnswerScope;
  readonly suggestions: string[];
  readonly text: string;
}

export interface PersonalAgentCitation {
  readonly detail: string;
  readonly href?: string;
  readonly label: string;
}

export type PersonalAgentAnswerScope =
  | {
      readonly kind: "league";
      readonly leagueId: string;
      readonly leagueName: string;
      readonly pathname?: string;
      readonly sectionId?: string | null;
    }
  | {
      readonly kind: "global";
      readonly pathname?: string;
      readonly scope?: Exclude<PersonalAgentPageContext["scope"], "league">;
      readonly sectionId?: string | null;
    };

export interface PersonalAgentSeasonGroupingContext {
  readonly id: string;
  readonly name: string;
  readonly ordinal: number;
  readonly seasons: number[];
}

export interface PersonalAgentQuestionLens {
  readonly grouping: PersonalAgentSeasonGroupingContext | null;
  readonly segment: RecordBookSegment;
}

export interface PersonalAgentLeagueQuestionContext {
  readonly canonFacts: string[];
  readonly catalog: CanonCatalog;
  readonly leagueId: string;
  readonly leagueName: string;
  readonly lens: PersonalAgentQuestionLens;
}

export interface PersonalAgentAnswerInput extends PersonalAgentBriefingInput {
  readonly context?: PersonalAgentPageContext;
  readonly loadLeagueQuestionContext?: (
    input: PersonalAgentLeagueQuestionContextInput,
  ) => Promise<PersonalAgentLeagueQuestionContext>;
  readonly question: string;
}

export interface PersonalAgentLeagueQuestionContextInput {
  readonly db: Db;
  readonly leagueId: string;
  readonly question: string;
}

type PersonalAgentQuestionIntent =
  | "best_season"
  | "championships"
  | "playoff_choker"
  | "top_score";

export type PersonalAgentBriefingResult =
  | PersonalAgentBriefingBlocked
  | PersonalAgentBriefingReady;

export interface PersonalAgentBriefingBlocked {
  readonly entitlement: EntitlementResolution;
  readonly status: "blocked";
}

export interface PersonalAgentBriefingReady {
  readonly briefing: PersonalAgentBriefing;
  readonly entitlement: EntitlementResolution;
  readonly status: "ready";
}

export interface PersonalAgentBriefing {
  readonly capped: boolean;
  readonly coveredLeagueCount: number;
  readonly generatedAt: string;
  readonly leagueLimit: number;
  readonly leagues: PersonalAgentLeagueBrief[];
  readonly totalLeagueCount: number;
}

export interface PersonalAgentLeagueBrief {
  readonly href: string;
  readonly latestPressTitle: string | null;
  readonly leagueId: string;
  readonly matchup: PersonalAgentMatchupBrief | null;
  readonly name: string;
  readonly providerLabel: string;
}

export interface PersonalAgentMatchupBrief {
  readonly label: string;
  readonly opponentScore: number | null;
  readonly opponentTeamName: string | null;
  readonly scoringPeriod: number;
  readonly status: YourLeagueMatchup["status"];
  readonly userScore: number | null;
  readonly userTeamName: string | null;
}

function currentTimestamp(input: PersonalAgentBriefingInput): Date {
  return input.now?.() ?? new Date();
}

function formatNumber(value: number, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits,
    minimumFractionDigits: Number.isInteger(value)
      ? 0
      : Math.min(2, maximumFractionDigits),
  }).format(value);
}

function cleanQuestion(question: string): string {
  return question.trim().replace(/\s+/gu, " ").slice(0, 400);
}

function inferSegment(question: string): RecordBookSegment {
  const lower = question.toLowerCase();
  if (/\b(playoff|postseason|championship|title)\b/u.test(lower)) {
    return "playoff";
  }
  if (/\bregular\b/u.test(lower)) {
    return "regular";
  }
  return "both";
}

function inferIntent(question: string): PersonalAgentQuestionIntent {
  const lower = question.toLowerCase();
  if (/\b(choker|collapse|snakebit|can't win|cant win)\b/u.test(lower)) {
    return "playoff_choker";
  }
  if (/\b(champion|championship|title)\b/u.test(lower)) {
    return "championships";
  }
  if (/\b(best season|best year|season)\b/u.test(lower)) {
    return "best_season";
  }
  return "top_score";
}

function requestedEraOrdinal(question: string): number | null {
  const match = /\bera\s*(\d+)\b/iu.exec(question);
  if (!match?.[1]) {
    return null;
  }

  const ordinal = Number(match[1]);
  return Number.isInteger(ordinal) && ordinal > 0 ? ordinal : null;
}

function segmentLabel(segment: RecordBookSegment): string {
  switch (segment) {
    case "both":
      return "regular plus playoff";
    case "playoff":
      return "playoff";
    case "regular":
      return "regular-season";
  }
}

function lensDetail(lens: PersonalAgentQuestionLens): string {
  const pieces = [`segment=${segmentLabel(lens.segment)}`];
  if (lens.grouping) {
    pieces.push(
      `era=${lens.grouping.name} (${lens.grouping.seasons.join(", ")})`,
    );
  } else {
    pieces.push("era=cumulative");
  }
  return pieces.join("; ");
}

function eraPhrase(lens: PersonalAgentQuestionLens): string {
  return lens.grouping ? ` in ${lens.grouping.name}` : "";
}

function matchupPhrase(row: {
  opponentName: string | null;
  scoringPeriod: number;
  season: number;
}): string {
  return [
    String(row.season),
    `Week ${row.scoringPeriod}`,
    row.opponentName ? `vs ${row.opponentName}` : null,
  ]
    .filter((piece): piece is string => Boolean(piece))
    .join(", ");
}

function answerTopScore(context: PersonalAgentLeagueQuestionContext): string {
  const top = context.catalog.highLow.highestScores[0];
  if (!top) {
    return `I do not have a ratified score leader for the ${segmentLabel(
      context.lens.segment,
    )} lens${eraPhrase(
      context.lens,
    )} yet. The answer stays empty until the curated Record Book has data for that slice.`;
  }

  return `${top.personName} owns the top ${segmentLabel(
    context.lens.segment,
  )} score${eraPhrase(context.lens)}: ${formatNumber(top.value)} points (${matchupPhrase(
    top,
  )}). I am reading the curated Record Book lens, so this uses confirmed era seasons and the segment filter instead of raw imported rows.`;
}

function answerBestSeason(context: PersonalAgentLeagueQuestionContext): string {
  const candidates = context.catalog.allTimeStandings
    .flatMap((row) =>
      row.bestSeason
        ? [
            {
              personName: row.personName,
              season: row.bestSeason,
            },
          ]
        : [],
    )
    .sort(
      (left, right) =>
        right.season.winPercentage - left.season.winPercentage ||
        right.season.pointsFor - left.season.pointsFor ||
        left.personName.localeCompare(right.personName),
    );
  const top = candidates[0];

  if (!top) {
    return `I do not have enough curated season rows to name an era-adjusted best season${eraPhrase(
      context.lens,
    )}.`;
  }

  return `${top.personName}'s ${top.season.season} season is the best season${eraPhrase(
    context.lens,
  )} in this lens: ${top.season.wins}-${top.season.losses}${
    top.season.ties ? `-${top.season.ties}` : ""
  }, ${formatNumber(top.season.pointsFor)} points for, ${formatNumber(
    top.season.winPercentage * 100,
    1,
  )}% win rate. I am comparing the curated season summaries inside the selected era/segment lens.`;
}

function playoffChokerScore(row: ManagerChampionshipRecord): number {
  return (
    row.playoffAppearances * 100 +
    row.championshipGameLosses * 20 +
    row.runnerUps * 15 -
    row.championships * 200 -
    row.championshipGameWins * 10
  );
}

function answerPlayoffChoker(
  context: PersonalAgentLeagueQuestionContext,
): string {
  const rows = context.catalog.championships.managerRecords
    .filter((row) => row.playoffAppearances > 0)
    .sort(
      (left, right) =>
        playoffChokerScore(right) - playoffChokerScore(left) ||
        right.playoffAppearances - left.playoffAppearances ||
        left.personName.localeCompare(right.personName),
    );
  const top = rows[0];

  if (!top) {
    return `The curated playoff ledger does not show enough playoff appearances${eraPhrase(
      context.lens,
    )} to call that fairly.`;
  }

  return `${top.personName} is the strongest data-backed playoff pain candidate${eraPhrase(
    context.lens,
  )}: ${top.playoffAppearances} playoff trips, ${top.runnerUps} runner-up finishes, and ${top.championships} championships. That is a records answer, not canon lore; I will not turn it into league mythology unless the league ratifies that claim.`;
}

function answerChampionships(
  context: PersonalAgentLeagueQuestionContext,
): string {
  const top = context.catalog.championships.managerRecords
    .filter((row) => row.championships > 0)
    .sort(
      (left, right) =>
        right.championships - left.championships ||
        right.championshipAppearances - left.championshipAppearances ||
        left.personName.localeCompare(right.personName),
    )[0];

  if (!top) {
    return `The curated championship ledger has no confirmed champion in this lens${eraPhrase(
      context.lens,
    )}.`;
  }

  return `${top.personName} leads the championship ledger${eraPhrase(
    context.lens,
  )}: ${top.championships} titles in ${top.championshipAppearances} title-game appearances, with ${top.playoffAppearances} playoff trips.`;
}

function answerLeagueQuestion(
  generatedAt: Date,
  question: string,
  context: PersonalAgentLeagueQuestionContext,
): PersonalAgentAnswer {
  const intent = inferIntent(question);
  const text =
    intent === "best_season"
      ? answerBestSeason(context)
      : intent === "championships"
        ? answerChampionships(context)
        : intent === "playoff_choker"
          ? answerPlayoffChoker(context)
          : answerTopScore(context);

  const citations: PersonalAgentCitation[] = [
    {
      detail: lensDetail(context.lens),
      href: `/leagues/${context.leagueId}/records`,
      label: "Curated Record Book",
    },
  ];
  if (context.lens.grouping) {
    citations.push({
      detail: `${context.lens.grouping.name}: ${context.lens.grouping.seasons.join(
        ", ",
      )}`,
      href: `/leagues/${context.leagueId}/records`,
      label: "Confirmed era grouping",
    });
  }
  citations.push(
    ...context.canonFacts.slice(0, 2).map((fact) => ({
      detail: fact,
      href: `/leagues/${context.leagueId}/lore`,
      label: "Ratified canon checked",
    })),
  );

  return {
    citations,
    generatedAt: generatedAt.toISOString(),
    question,
    scope: {
      kind: "league",
      leagueId: context.leagueId,
      leagueName: context.leagueName,
    },
    suggestions: [
      "Show me the regular-season version.",
      "Who owns the best season in this era?",
      "What canon lore changes this answer?",
    ],
    text,
  };
}

function selectedGrouping(
  question: string,
  groupings: readonly PersonalAgentSeasonGroupingContext[],
): PersonalAgentSeasonGroupingContext | null {
  const ordinal = requestedEraOrdinal(question);
  if (!ordinal) {
    return null;
  }
  return (
    groupings.find((grouping) => grouping.ordinal === ordinal) ??
    groupings[ordinal - 1] ??
    null
  );
}

function toAgentGrouping(
  grouping: RecordsGroupingOption,
): PersonalAgentSeasonGroupingContext {
  return {
    id: grouping.id,
    name: grouping.name,
    ordinal: grouping.ordinal,
    seasons: grouping.seasons,
  };
}

export async function loadPersonalAgentLeagueQuestionContext({
  db,
  leagueId,
  question,
}: PersonalAgentLeagueQuestionContextInput): Promise<PersonalAgentLeagueQuestionContext> {
  const [league] = await db
    .select({ name: leagues.name })
    .from(leagues)
    .where(eq(leagues.id, leagueId))
    .limit(1);

  const canonFacts = await withLeagueContext(db, leagueId, async (tx) => {
    const canonRows = await tx
      .select({
        statement: loreClaims.statement,
        title: loreClaims.title,
      })
      .from(loreClaims)
      .where(
        and(eq(loreClaims.leagueId, leagueId), eq(loreClaims.status, "canon")),
      )
      .orderBy(asc(loreClaims.createdAt))
      .limit(3);

    return canonRows.map((row) => `${row.title}: ${row.statement}`);
  });

  const canonContext = await getLeagueCanonRecordsContext(db, {
    leagueId,
    limit: 5,
    resolveLens: (groupings): RecordsLensInput => {
      const eraGroupings = groupings
        .filter((grouping) => grouping.kind === "era")
        .map(toAgentGrouping);
      const selected = selectedGrouping(question, eraGroupings);
      return {
        groupingId: selected?.id ?? null,
        segment: inferSegment(question),
      };
    },
  });
  const grouping = canonContext.lens.groupingId
    ? (canonContext.lens.groupings
        .filter((option) => option.kind === "era")
        .map(toAgentGrouping)
        .find((option) => option.id === canonContext.lens.groupingId) ?? null)
    : null;

  return {
    canonFacts,
    catalog: canonContext.catalog,
    leagueId,
    leagueName: league?.name ?? "Current league",
    lens: {
      grouping,
      segment: canonContext.lens.segment,
    },
  };
}

function userAndOpponentSides(
  matchup: YourLeagueMatchup,
): { opponent: YourLeagueMatchupSide; user: YourLeagueMatchupSide } | null {
  if (!matchup.isUserMatchup) {
    return null;
  }

  if (matchup.home.isUserTeam) {
    return { opponent: matchup.away, user: matchup.home };
  }

  if (matchup.away.isUserTeam) {
    return { opponent: matchup.home, user: matchup.away };
  }

  return null;
}

function matchupBrief(matchup: YourLeagueMatchup): PersonalAgentMatchupBrief {
  const sides = userAndOpponentSides(matchup);
  if (sides) {
    return {
      label: `${sides.user.name} vs ${sides.opponent.name}`,
      opponentScore: sides.opponent.score,
      opponentTeamName: sides.opponent.name,
      scoringPeriod: matchup.scoringPeriod,
      status: matchup.status,
      userScore: sides.user.score,
      userTeamName: sides.user.name,
    };
  }

  return {
    label: `${matchup.away.name} at ${matchup.home.name}`,
    opponentScore: null,
    opponentTeamName: null,
    scoringPeriod: matchup.scoringPeriod,
    status: matchup.status,
    userScore: null,
    userTeamName: null,
  };
}

function leagueBrief(league: YourLeagueCard): PersonalAgentLeagueBrief {
  return {
    href: league.href,
    latestPressTitle: league.latestPress?.title ?? null,
    leagueId: league.leagueId,
    matchup: league.matchup ? matchupBrief(league.matchup) : null,
    name: league.name,
    providerLabel: league.providerLabel,
  };
}

export async function getPersonalAgentBriefing(
  input: PersonalAgentBriefingInput,
): Promise<PersonalAgentBriefingResult> {
  const generatedAt = currentTimestamp(input);
  const entitlement = await resolveEntitlement({
    capability: "ai.individual.agent",
    db: input.db,
    env: input.env,
    now: input.now,
    userId: input.userId,
  });

  if (!entitlement.allowed) {
    return {
      entitlement,
      status: "blocked",
    };
  }

  const loadLandingData = input.loadLandingData ?? getYourLeaguesLandingData;
  const landing = await loadLandingData(input.db, {
    userId: input.userId,
  });
  const leagueLimit = entitlement.caps.individualLeaguesCovered;
  const covered = landing.leagues.slice(0, leagueLimit);

  return {
    briefing: {
      capped: landing.leagues.length > covered.length,
      coveredLeagueCount: covered.length,
      generatedAt: generatedAt.toISOString(),
      leagueLimit,
      leagues: covered.map(leagueBrief),
      totalLeagueCount: landing.leagues.length,
    },
    entitlement,
    status: "ready",
  };
}

export async function getPersonalAgentAnswer(
  input: PersonalAgentAnswerInput,
): Promise<PersonalAgentAnswerResult> {
  const generatedAt = currentTimestamp(input);
  const question = cleanQuestion(input.question);
  const entitlement = await resolveEntitlement({
    capability: "ai.individual.agent",
    db: input.db,
    env: input.env,
    now: input.now,
    userId: input.userId,
  });

  if (!entitlement.allowed) {
    return {
      entitlement,
      status: "blocked",
    };
  }

  if (input.context?.leagueId) {
    const loadLeagueQuestionContext =
      input.loadLeagueQuestionContext ?? loadPersonalAgentLeagueQuestionContext;
    const leagueContext = await loadLeagueQuestionContext({
      db: input.db,
      leagueId: input.context.leagueId,
      question,
    });
    const answer = answerLeagueQuestion(generatedAt, question, leagueContext);
    return {
      answer: {
        ...answer,
        scope: {
          ...answer.scope,
          pathname: input.context.pathname,
          sectionId: input.context.sectionId,
        },
      },
      entitlement,
      status: "ready",
    };
  }

  const briefing = await getPersonalAgentBriefing({
    db: input.db,
    env: input.env,
    loadLandingData: input.loadLandingData,
    now: input.now,
    userId: input.userId,
  });

  if (briefing.status === "blocked") {
    return briefing;
  }

  const covered = briefing.briefing.leagues;
  const leagueList = covered
    .slice(0, 3)
    .map((league) => league.name)
    .join(", ");
  const capped = briefing.briefing.capped
    ? ` I am showing the first ${briefing.briefing.leagueLimit} leagues by recency.`
    : "";

  return {
    answer: {
      citations: [
        {
          detail: `${briefing.briefing.coveredLeagueCount} covered of ${briefing.briefing.totalLeagueCount} connected leagues`,
          href: "/you",
          label: "Personal briefing",
        },
      ],
      generatedAt: generatedAt.toISOString(),
      question,
      scope: {
        kind: "global",
        pathname: input.context?.pathname,
        scope:
          input.context?.scope === "league" ? undefined : input.context?.scope,
        sectionId: input.context?.sectionId,
      },
      suggestions: [
        "Open a league and ask about playoff records.",
        "Which league needs attention this week?",
        "Show my current matchups.",
      ],
      text:
        covered.length > 0
          ? `I am scoped across your personal league set: ${leagueList}.${
              covered.length > 3 ? " and more." : ""
            }${capped} Open a league page when you want me to reason over that league's curated era-aware records.`
          : "I do not see a connected league yet. Connect or import a league, then I can reason over its curated records, canon lore, and current page context.",
    },
    entitlement,
    status: "ready",
  };
}
