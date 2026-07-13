import * as fc from "fast-check";
import type {
  NormalizedDraftPick,
  NormalizedFinalStanding,
  NormalizedLeague,
  NormalizedMatchup,
  NormalizedMember,
  NormalizedPlayer,
  NormalizedPlayerStatBreakdown,
  NormalizedRoster,
  NormalizedRosterEntry,
  NormalizedSeasonBundle,
  NormalizedTeam,
  NormalizedTransaction,
  SeasonScopedProviderEntityRef,
} from "@/providers/model";

export const NORMALIZED_ERA_POSITION_VOCABULARIES = {
  legacy: ["TQB", "WR/TE", "D/ST", "PK"],
  mixed: ["TQB", "QB", "WR/TE", "WR", "D/ST", "PK", "K"],
  modern: ["QB", "RB", "WR", "TE", "D/ST", "K"],
} as const;

export type NormalizedEraVocabulary =
  keyof typeof NORMALIZED_ERA_POSITION_VOCABULARIES;

export type GeneratedNameStyle = "ascii" | "duplicate" | "unicode";
export type GeneratedOwnerOverlap = "co_owned" | "none" | "shared_member";

export interface NormalizedSeasonShape {
  caseId: number;
  draft: boolean;
  era: NormalizedEraVocabulary;
  leagueSize: number;
  nameStyle: GeneratedNameStyle;
  ownerOverlap: GeneratedOwnerOverlap;
  playerDepth: boolean;
  playersPerTeam: number;
  playoffMatchupPeriodLength: 1 | 2;
  playoffRounds: number;
  playoffTeamCount: number;
  regularSeasonWeeks: number;
  season: number;
  statBreakdowns: boolean;
  transactions: boolean;
  zeroScoreWeek: number | null;
}

interface TeamRecord {
  losses: number;
  pointsAgainst: number;
  pointsFor: number;
  ties: number;
  wins: number;
}

interface GeneratedPlayerSlot {
  lineupSlotId: number;
  player: NormalizedPlayer;
}

const ASCII_TEAM_NAMES = [
  "Comets",
  "Foundry",
  "Night Shift",
  "Paper Tigers",
] as const;
const UNICODE_TEAM_NAMES = [
  "München Möwen",
  "東京ドラゴンズ",
  "São Paulo Çafé",
  "Київ Комети",
] as const;
const UNICODE_OWNER_NAMES = ["Zoë", "李雷", "Óscar", "Саша"] as const;

const POSITION_IDS: Readonly<Record<string, number>> = {
  "D/ST": 16,
  K: 17,
  PK: 17,
  QB: 0,
  RB: 2,
  TE: 6,
  TQB: 1,
  WR: 4,
  "WR/TE": 5,
};

const EMPTY_RECORD = {
  losses: 0,
  pointsAgainst: 0,
  pointsFor: 0,
  ties: 0,
  wins: 0,
} as const;

const seasonStructureArbitrary = fc
  .record({
    playoffMatchupPeriodLength: fc.constantFrom<1 | 2>(1, 2),
    playoffRounds: fc.integer({ max: 3, min: 1 }),
    regularSeasonWeeks: fc.integer({ max: 14, min: 1 }),
  })
  .chain((structure) => {
    const finalScoringPeriod =
      structure.regularSeasonWeeks +
      structure.playoffRounds * structure.playoffMatchupPeriodLength;
    return fc.record({
      ...Object.fromEntries(
        Object.entries(structure).map(([key, value]) => [
          key,
          fc.constant(value),
        ]),
      ),
      zeroScoreWeek: fc.oneof(
        fc.constant(null),
        fc.integer({ max: finalScoringPeriod, min: 1 }),
      ),
    }) as fc.Arbitrary<
      Pick<
        NormalizedSeasonShape,
        | "playoffMatchupPeriodLength"
        | "playoffRounds"
        | "regularSeasonWeeks"
        | "zeroScoreWeek"
      >
    >;
  });

/**
 * Compact input for bundle properties. Prefer properties over this arbitrary,
 * then call buildNormalizedSeasonBundle(), so failures shrink to one readable
 * shape instead of printing every generated database row.
 */
export const normalizedSeasonShapeArbitrary: fc.Arbitrary<NormalizedSeasonShape> =
  fc.integer({ max: 20, min: 4 }).chain((leagueSize) =>
    seasonStructureArbitrary.chain((structure) =>
      fc
        .record({
          caseId: fc.integer({ max: 999_999, min: 0 }),
          draft: fc.boolean(),
          era: fc.constantFrom<NormalizedEraVocabulary>(
            "legacy",
            "modern",
            "mixed",
          ),
          nameStyle: fc.constantFrom<GeneratedNameStyle>(
            "ascii",
            "duplicate",
            "unicode",
          ),
          ownerOverlap: fc.constantFrom<GeneratedOwnerOverlap>(
            "none",
            "shared_member",
            "co_owned",
          ),
          playerDepth: fc.boolean(),
          playersPerTeam: fc.integer({ max: 5, min: 1 }),
          playoffTeamCount: fc.integer({ max: leagueSize, min: 2 }),
          season: fc.integer({ max: 2026, min: 2000 }),
          statBreakdowns: fc.boolean(),
          transactions: fc.boolean(),
        })
        .map((generated) => ({
          ...generated,
          ...structure,
          leagueSize,
          statBreakdowns: generated.playerDepth && generated.statBreakdowns,
        })),
    ),
  );

export const normalizedPlayerStatBreakdownArbitrary: fc.Arbitrary<NormalizedPlayerStatBreakdown> =
  fc.record({
    fantasyPoints: fc.double({ max: 100, min: -20, noNaN: true }),
    providerStatId: fc.constantFrom(3, 24, 42, 74),
    statCategory: fc.constantFrom("passing", "rushing", "receiving", "kicking"),
    statKey: fc.constantFrom(
      "passingYards",
      "rushingYards",
      "receivingYards",
      "madeFieldGoalsFrom50Plus",
    ),
    statSource: fc.constantFrom("actual" as const, "projected" as const),
    statValue: fc.double({ max: 500, min: -20, noNaN: true }),
  });

export const normalizedPlayerArbitrary: fc.Arbitrary<NormalizedPlayer> = fc
  .record({
    fullName: fc.constantFrom("Alex Smith", "José Núñez", "同名選手"),
    position: fc.constantFrom(
      ...NORMALIZED_ERA_POSITION_VOCABULARIES.mixed,
      "RB",
      "TE",
    ),
    providerId: fc.integer({ max: 999_999, min: 1 }).map(String),
  })
  .map(({ fullName, position, providerId }) => ({
    fullName,
    metadata: {
      defaultPositionId: POSITION_IDS[position],
      eligibleSlots: [POSITION_IDS[position]],
      proTeamId: position === "D/ST" ? 0 : 1,
    },
    position,
    proTeam: position === "D/ST" ? "FA" : "ATL",
    provider: "espn",
    providerId: position === "D/ST" ? `-${providerId}` : providerId,
    status: "active",
  }));

function teamName(style: GeneratedNameStyle, teamIndex: number): string {
  if (style === "duplicate") return "Same Name";
  const names = style === "unicode" ? UNICODE_TEAM_NAMES : ASCII_TEAM_NAMES;
  return `${names[teamIndex % names.length]} ${teamIndex + 1}`;
}

function ownerDisplayName(
  style: GeneratedNameStyle,
  memberIndex: number,
): string {
  if (style === "duplicate") return "Same Owner";
  if (style === "unicode") {
    return `${UNICODE_OWNER_NAMES[memberIndex % UNICODE_OWNER_NAMES.length]} ${memberIndex + 1}`;
  }
  return `Owner ${memberIndex + 1}`;
}

function ownerIdsForTeam(
  overlap: GeneratedOwnerOverlap,
  teamIndex: number,
): string[] {
  const uniqueOwner = `owner-${teamIndex + 1}`;
  if (overlap === "shared_member") return ["owner-shared"];
  if (overlap === "co_owned") return [uniqueOwner, "owner-shared"];
  return [uniqueOwner];
}

function scheduleForWeek(
  leagueSize: number,
  scoringPeriod: number,
): [number, number][] {
  const participants: Array<number | null> = Array.from(
    { length: leagueSize },
    (_, index) => index,
  );
  if (participants.length % 2 === 1) participants.push(null);
  const fixed = participants[0];
  const rotating = participants.slice(1);
  const offset = (scoringPeriod - 1) % rotating.length;
  const rotated = [
    fixed,
    ...rotating.slice(offset),
    ...rotating.slice(0, offset),
  ];
  const pairs: [number, number][] = [];
  for (let index = 0; index < rotated.length / 2; index += 1) {
    const home = rotated[index];
    const away = rotated[rotated.length - 1 - index];
    if (home !== null && away !== null) pairs.push([home, away]);
  }
  return pairs;
}

function scoreFor(
  shape: NormalizedSeasonShape,
  scoringPeriod: number,
  teamIndex: number,
): number {
  if (shape.zeroScoreWeek === scoringPeriod) return 0;
  return 70 + ((shape.caseId + scoringPeriod * 11 + teamIndex * 7) % 81);
}

function generatedMatchupPeriods(shape: NormalizedSeasonShape): number[] {
  const regularPeriods = Array.from(
    { length: shape.regularSeasonWeeks },
    (_, index) => index + 1,
  );
  const playoffPeriods = Array.from(
    { length: shape.playoffRounds },
    (_, index) =>
      shape.regularSeasonWeeks + 1 + index * shape.playoffMatchupPeriodLength,
  );
  return [...regularPeriods, ...playoffPeriods];
}

function buildMatchupsAndRecords(
  shape: NormalizedSeasonShape,
  leagueProviderId: string,
): { matchups: NormalizedMatchup[]; records: TeamRecord[] } {
  const records: TeamRecord[] = Array.from(
    { length: shape.leagueSize },
    () => ({ ...EMPTY_RECORD }),
  );
  const matchups = generatedMatchupPeriods(shape).flatMap((scoringPeriod) =>
    scheduleForWeek(shape.leagueSize, scoringPeriod).map(
      ([homeIndex, awayIndex], matchupIndex): NormalizedMatchup => {
        const homeScore = scoreFor(shape, scoringPeriod, homeIndex);
        const awayScore = scoreFor(shape, scoringPeriod, awayIndex);
        const winner =
          homeScore === awayScore
            ? "tie"
            : homeScore > awayScore
              ? "home"
              : "away";
        const homeRecord = records[homeIndex];
        const awayRecord = records[awayIndex];
        homeRecord.pointsFor += homeScore;
        homeRecord.pointsAgainst += awayScore;
        awayRecord.pointsFor += awayScore;
        awayRecord.pointsAgainst += homeScore;
        homeRecord.wins += winner === "home" ? 1 : 0;
        homeRecord.losses += winner === "away" ? 1 : 0;
        homeRecord.ties += winner === "tie" ? 1 : 0;
        awayRecord.wins += winner === "away" ? 1 : 0;
        awayRecord.losses += winner === "home" ? 1 : 0;
        awayRecord.ties += winner === "tie" ? 1 : 0;
        const playoff = scoringPeriod > shape.regularSeasonWeeks;
        return {
          awayScore,
          awayTeamRef: {
            provider: "espn",
            providerId: String(awayIndex + 1),
            season: shape.season,
          },
          homeScore,
          homeTeamRef: {
            provider: "espn",
            providerId: String(homeIndex + 1),
            season: shape.season,
          },
          kind: "head_to_head",
          leagueProviderId,
          periodStart: scoringPeriod,
          provider: "espn",
          providerId: `matchup-${scoringPeriod}-${matchupIndex + 1}`,
          scoringPeriod,
          scoringPeriodSpan: playoff ? shape.playoffMatchupPeriodLength : 1,
          season: shape.season,
          status: "final",
          winner,
        };
      },
    ),
  );
  return { matchups, records };
}

function buildTeams(
  shape: NormalizedSeasonShape,
  leagueProviderId: string,
  records: readonly TeamRecord[],
): NormalizedTeam[] {
  return records.map((record, teamIndex) => ({
    abbrev: `T${String(teamIndex + 1).padStart(2, "0")}`,
    leagueProviderId,
    name: teamName(shape.nameStyle, teamIndex),
    ownerMemberIds: ownerIdsForTeam(shape.ownerOverlap, teamIndex),
    provider: "espn",
    providerId: String(teamIndex + 1),
    record: { ...record },
    season: shape.season,
  }));
}

function buildMembers(
  shape: NormalizedSeasonShape,
  leagueProviderId: string,
  teams: readonly NormalizedTeam[],
): NormalizedMember[] {
  const memberIds = [...new Set(teams.flatMap((team) => team.ownerMemberIds))];
  return memberIds.map((providerId, memberIndex) => ({
    displayName: ownerDisplayName(shape.nameStyle, memberIndex),
    leagueProviderId,
    provider: "espn",
    providerId,
    role: memberIndex === 0 ? "commissioner" : "member",
    season: shape.season,
  }));
}

function playerId(
  shape: NormalizedSeasonShape,
  teamIndex: number,
  playerIndex: number,
  position: string,
): string {
  const id = shape.caseId * 10_000 + teamIndex * 100 + playerIndex + 1;
  return position === "D/ST" ? String(-(id + 1)) : String(id + 1);
}

function buildPlayerSlots(
  shape: NormalizedSeasonShape,
  leagueProviderId: string,
): GeneratedPlayerSlot[][] {
  const vocabulary = NORMALIZED_ERA_POSITION_VOCABULARIES[shape.era];
  return Array.from({ length: shape.leagueSize }, (_, teamIndex) =>
    Array.from({ length: shape.playersPerTeam }, (_, playerIndex) => {
      const position = vocabulary[playerIndex % vocabulary.length];
      const lineupSlotId = POSITION_IDS[position];
      const providerId = playerId(shape, teamIndex, playerIndex, position);
      return {
        lineupSlotId,
        player: {
          fullName:
            shape.nameStyle === "duplicate"
              ? "Same Player"
              : shape.nameStyle === "unicode"
                ? `選手 ${teamIndex + 1}-${playerIndex + 1}`
                : `Player ${teamIndex + 1}-${playerIndex + 1}`,
          leagueProviderId,
          metadata: {
            defaultPositionId: lineupSlotId,
            eligibleSlots: [lineupSlotId],
            generatedEra: shape.era,
            proTeamId: position === "D/ST" ? 0 : 1,
          },
          position,
          proTeam: position === "D/ST" ? "FA" : "ATL",
          provider: "espn",
          providerId,
          status: "active",
        },
      };
    }),
  );
}

function playerPoints(
  shape: NormalizedSeasonShape,
  scoringPeriod: number,
  teamIndex: number,
  playerIndex: number,
): number {
  if (playerIndex > 0) return 0;
  return scoreFor(shape, scoringPeriod, teamIndex);
}

function buildStatBreakdown(points: number): NormalizedPlayerStatBreakdown[] {
  return [
    {
      fantasyPoints: points,
      providerStatId: 3,
      statCategory: "passing",
      statKey: "passingYards",
      statSource: "actual",
      statValue: points * 10,
    },
  ];
}

function buildRosterEntry(
  shape: NormalizedSeasonShape,
  slot: GeneratedPlayerSlot,
  scoringPeriod: number,
  teamIndex: number,
  playerIndex: number,
): NormalizedRosterEntry {
  const points = playerPoints(shape, scoringPeriod, teamIndex, playerIndex);
  return {
    actualPoints: points,
    metadata: { lineupSlotId: slot.lineupSlotId },
    player: slot.player,
    playerRef: {
      provider: slot.player.provider,
      providerId: slot.player.providerId,
    },
    points,
    projectedPoints: points + 1,
    slot: slot.player.position,
    started: true,
    statBreakdown: shape.statBreakdowns
      ? buildStatBreakdown(points)
      : undefined,
    status: "active",
  };
}

function buildRosters(
  shape: NormalizedSeasonShape,
  playerSlots: readonly GeneratedPlayerSlot[][],
): NormalizedRoster[] | undefined {
  if (!shape.playerDepth) return undefined;
  return generatedMatchupPeriods(shape).flatMap((scoringPeriod) =>
    playerSlots.map((slots, teamIndex) => ({
      entries: slots.map((slot, playerIndex) =>
        buildRosterEntry(shape, slot, scoringPeriod, teamIndex, playerIndex),
      ),
      scoringPeriod,
      season: shape.season,
      teamRef: {
        provider: "espn",
        providerId: String(teamIndex + 1),
        season: shape.season,
      },
    })),
  );
}

function buildDraftPicks(
  shape: NormalizedSeasonShape,
  leagueProviderId: string,
  playerSlots: readonly GeneratedPlayerSlot[][],
): NormalizedDraftPick[] | undefined {
  if (!shape.draft) return undefined;
  let pickOverall = 0;
  return playerSlots.flatMap((slots, teamIndex) =>
    slots.map((slot, playerIndex) => {
      pickOverall += 1;
      return {
        auctionValue: shape.caseId % 2 === 0 ? playerIndex + 1 : undefined,
        isKeeper: playerIndex === 0 && shape.season % 2 === 0,
        leagueProviderId,
        metadata: { lineupSlotId: slot.lineupSlotId },
        pickInRound: teamIndex + 1,
        pickOverall,
        player: slot.player,
        playerRef: {
          provider: slot.player.provider,
          providerId: slot.player.providerId,
        },
        provider: "espn",
        providerId: `pick-${teamIndex + 1}-${playerIndex + 1}`,
        round: playerIndex + 1,
        season: shape.season,
        teamRef: {
          provider: "espn",
          providerId: String(teamIndex + 1),
          season: shape.season,
        },
      } satisfies NormalizedDraftPick;
    }),
  );
}

function buildTransactions(
  shape: NormalizedSeasonShape,
  leagueProviderId: string,
  playerSlots: readonly GeneratedPlayerSlot[][],
): NormalizedTransaction[] {
  if (!shape.transactions) return [];
  const firstPlayer = playerSlots[0]?.[0]?.player;
  const teamRef: SeasonScopedProviderEntityRef = {
    provider: "espn",
    providerId: "1",
    season: shape.season,
  };
  return [
    {
      details: { rawActivityTypeId: 178 },
      leagueProviderId,
      playerRefs: firstPlayer
        ? [
            {
              provider: firstPlayer.provider,
              providerId: firstPlayer.providerId,
            },
          ]
        : [],
      provider: "espn",
      providerId: "transaction-1",
      scoringPeriod: 1,
      season: shape.season,
      teamRefs: [teamRef],
      timestamp: new Date(`${shape.season}-09-01T12:00:00.000Z`),
      type: "add",
    },
  ];
}

function buildFinalStandings(
  shape: NormalizedSeasonShape,
  leagueProviderId: string,
  teams: readonly NormalizedTeam[],
): NormalizedFinalStanding[] {
  const ranked = [...teams].sort(
    (left, right) =>
      right.record.wins - left.record.wins ||
      right.record.pointsFor - left.record.pointsFor ||
      left.providerId.localeCompare(right.providerId, undefined, {
        numeric: true,
      }),
  );
  return ranked.map((team, rankIndex) => ({
    leagueProviderId,
    losses: team.record.losses,
    playoffSeed: rankIndex + 1,
    pointsAgainst: team.record.pointsAgainst,
    pointsFor: team.record.pointsFor,
    rank: rankIndex + 1,
    rankConfidence: "high",
    rankSource: "provider_reported",
    teamRef: {
      provider: "espn",
      providerId: team.providerId,
      season: shape.season,
    },
    ties: team.record.ties,
    wins: team.record.wins,
  }));
}

function lineupSlotCounts(
  era: NormalizedEraVocabulary,
): Record<string, number> {
  const modern = { "0": 1, "2": 2, "4": 2, "6": 1, "16": 1, "17": 1 };
  const legacy = { "1": 1, "2": 2, "5": 1, "16": 1, "17": 1 };
  if (era === "legacy") return { ...legacy, "20": 5 };
  if (era === "modern") return { ...modern, "20": 6, "23": 1 };
  return { ...legacy, ...modern, "20": 6, "23": 1 };
}

function buildLeague(
  shape: NormalizedSeasonShape,
  leagueProviderId: string,
): NormalizedLeague {
  const championshipScoringPeriod =
    shape.regularSeasonWeeks +
    shape.playoffRounds * shape.playoffMatchupPeriodLength;
  return {
    currentScoringPeriod: championshipScoringPeriod,
    keeperSettings: {
      isDynasty: false,
      isKeeper: shape.draft && shape.season % 2 === 0,
    },
    name: `Generated ${shape.caseId}`,
    postseason: {
      championshipScoringPeriod,
      matchupPeriodCount: shape.regularSeasonWeeks,
      playoffMatchupPeriodLength: shape.playoffMatchupPeriodLength,
      playoffStartScoringPeriod: shape.regularSeasonWeeks + 1,
      playoffTeamCount: shape.playoffTeamCount,
      regularSeasonEndScoringPeriod: shape.regularSeasonWeeks,
    },
    provider: "espn",
    providerId: leagueProviderId,
    rosterSettings: { lineupSlotCounts: lineupSlotCounts(shape.era) },
    scoringSettings: {
      scoringItems: [{ points: 0.04, statId: 3 }],
      scoringType: "H2H_POINTS",
    },
    scoringType: "H2H_POINTS",
    season: shape.season,
    size: shape.leagueSize,
    sport: "ffl",
    status: "complete",
  };
}

/** Deterministically materializes a relationally consistent normalized bundle. */
export function buildNormalizedSeasonBundle(
  shape: NormalizedSeasonShape,
  leagueProviderId = `generated-${shape.caseId}`,
): NormalizedSeasonBundle {
  const { matchups, records } = buildMatchupsAndRecords(
    shape,
    leagueProviderId,
  );
  const teams = buildTeams(shape, leagueProviderId, records);
  const members = buildMembers(shape, leagueProviderId, teams);
  const playerSlots = buildPlayerSlots(shape, leagueProviderId);
  const players =
    shape.playerDepth || shape.draft
      ? playerSlots.flatMap((slots) => slots.map((slot) => slot.player))
      : undefined;
  return {
    draftPicks: buildDraftPicks(shape, leagueProviderId, playerSlots),
    finalStandings: buildFinalStandings(shape, leagueProviderId, teams),
    league: buildLeague(shape, leagueProviderId),
    matchups,
    members,
    players,
    rosters: buildRosters(shape, playerSlots),
    teams,
    transactions: buildTransactions(shape, leagueProviderId, playerSlots),
  };
}

export const normalizedSeasonBundleArbitrary: fc.Arbitrary<NormalizedSeasonBundle> =
  normalizedSeasonShapeArbitrary.map((shape) => {
    const bundle = buildNormalizedSeasonBundle(shape);
    Object.defineProperty(bundle, fc.toStringMethod, {
      configurable: true,
      value: () => `NormalizedSeasonBundle(${fc.stringify(shape)})`,
    });
    return bundle;
  });
