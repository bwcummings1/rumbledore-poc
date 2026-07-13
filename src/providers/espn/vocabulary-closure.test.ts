import { describe, expect, it } from "vitest";
import activitiesVocabulary from "./__vocabulary__/activities.json";
import dictionaryExceptions from "./__vocabulary__/dictionary-exceptions.json";
import leagueFormatVocabulary from "./__vocabulary__/league-format-enums.json";
import lineupSlotsVocabulary from "./__vocabulary__/lineup-slots.json";
import playerStatsVocabulary from "./__vocabulary__/player-stat-ids.json";
import positionsVocabulary from "./__vocabulary__/positions.json";
import proTeamsVocabulary from "./__vocabulary__/pro-teams.json";
import scoringStatsVocabulary from "./__vocabulary__/scoring-stat-ids.json";
import {
  ESPN_ACTIVITY_BY_ID,
  ESPN_LINEUP_SLOT_BY_ID,
  ESPN_PLAYER_STAT_KEY_BY_ID,
  ESPN_POSITION_BY_ID,
  ESPN_PRO_TEAM_BY_ID,
  ESPN_SCORING_STAT_BY_ID,
} from "./reference-data";

interface SourcedNumericEntry {
  code: number;
  source: string;
}

interface DocumentedException {
  code: number;
  reason: string;
}

interface IndependentDerivation {
  method: string;
  productionDictionaryConsulted: boolean;
  sources: readonly string[];
  validationCaveat: string;
}

function assertReasonedExceptions(
  kind: string,
  exceptions: readonly DocumentedException[],
): void {
  for (const exception of exceptions) {
    if (exception.reason.trim().length === 0) {
      throw new Error(
        `${kind} dictionary exception ${exception.code} must include a non-empty reason`,
      );
    }
  }
}

function assertNumericClosure(
  kind: string,
  dictionary: Readonly<Partial<Record<number, unknown>>>,
  entries: readonly SourcedNumericEntry[],
  documentedExceptions: readonly DocumentedException[],
): void {
  const corpusCodes = new Set(entries.map((entry) => entry.code));
  assertReasonedExceptions(kind, documentedExceptions);
  const exceptionCodes = new Set(
    documentedExceptions.map((exception) => exception.code),
  );

  for (const entry of entries) {
    if (dictionary[entry.code] === undefined) {
      throw new Error(
        `${kind} corpus code ${entry.code} is missing from the ESPN dictionary`,
      );
    }
  }

  for (const rawCode of Object.keys(dictionary)) {
    const code = Number(rawCode);
    if (!corpusCodes.has(code) && !exceptionCodes.has(code)) {
      throw new Error(
        `${kind} dictionary code ${code} has no corpus source or documented exception`,
      );
    }
  }
}

function assertSourced(entries: readonly { source: string }[]): void {
  for (const entry of entries) {
    expect(entry.source.trim().length).toBeGreaterThan(0);
  }
}

function assertIndependentDerivation(derivation: IndependentDerivation): void {
  expect(derivation.method).toBe(
    "independent_training_knowledge_transcription",
  );
  expect(derivation.productionDictionaryConsulted).toBe(false);
  expect(derivation.sources.length).toBeGreaterThan(0);
  expect(derivation.validationCaveat).toContain(
    "pending approved multi-league real-payload harvest validation",
  );
  for (const source of derivation.sources) {
    expect(source.trim().length).toBeGreaterThan(0);
    expect(source).not.toContain("reference-data");
  }
}

describe("ESPN vendored vocabulary closure", () => {
  it("names the exact missing code in either direction", () => {
    expect(() =>
      assertNumericClosure(
        "position",
        {},
        [{ code: 17, source: "fixture" }],
        [],
      ),
    ).toThrow("position corpus code 17 is missing from the ESPN dictionary");

    expect(() => assertNumericClosure("position", { 17: "K" }, [], [])).toThrow(
      "position dictionary code 17 has no corpus source or documented exception",
    );

    expect(() =>
      assertReasonedExceptions("position", [{ code: 17, reason: " " }]),
    ).toThrow(
      "position dictionary exception 17 must include a non-empty reason",
    );
  });

  it("records an independent derivation and its real-payload validation caveat", () => {
    for (const vocabulary of [
      activitiesVocabulary,
      leagueFormatVocabulary,
      lineupSlotsVocabulary,
      playerStatsVocabulary,
      positionsVocabulary,
      proTeamsVocabulary,
      scoringStatsVocabulary,
    ]) {
      assertIndependentDerivation(vocabulary.derivation);
    }
  });

  it("documents every source-to-production value delta with a reason", () => {
    expect(
      positionsVocabulary.entries.find((entry) => entry.code === 22),
    ).toMatchObject({
      code: 22,
      label: "N/A",
      normalizationReason:
        "The clients expose a blank sentinel; Rumbledore renders it as N/A.",
      sourceLabel: "",
    });
    expect(
      lineupSlotsVocabulary.entries.find((entry) => entry.code === 22),
    ).toMatchObject({
      code: 22,
      label: "N/A",
      normalizationReason:
        "The clients expose a blank sentinel; Rumbledore renders it as N/A.",
      sourceLabel: "",
    });
    expect(
      lineupSlotsVocabulary.entries.find((entry) => entry.code === 23),
    ).toMatchObject({
      code: 23,
      label: "FLEX",
      normalizationReason:
        "The client maps the same code forward as RB/WR/TE and inversely as FLEX; lineup-slot context uses FLEX.",
      sourceLabel: "RB/WR/TE",
    });
    expect(
      proTeamsVocabulary.entries.find((entry) => entry.code === 0),
    ).toMatchObject({
      abbreviation: "FA",
      code: 0,
      normalizationReason:
        "The clients label provider team 0 as None; player context represents it as free agent (FA).",
      sourceAbbreviation: "None",
    });

    const documentedDeltas = [
      ...positionsVocabulary.entries,
      ...lineupSlotsVocabulary.entries,
      ...proTeamsVocabulary.entries,
    ].filter((entry) => "normalizationReason" in entry);
    expect(documentedDeltas).toHaveLength(4);
    for (const entry of documentedDeltas) {
      const reason = entry.normalizationReason;
      expect(typeof reason).toBe("string");
      if (typeof reason === "string") {
        expect(reason.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("closes positions and lineup slots, including old-era labels", () => {
    assertNumericClosure(
      "position",
      ESPN_POSITION_BY_ID,
      positionsVocabulary.entries,
      dictionaryExceptions.positions,
    );
    assertNumericClosure(
      "lineup slot",
      ESPN_LINEUP_SLOT_BY_ID,
      lineupSlotsVocabulary.entries,
      dictionaryExceptions.lineupSlots,
    );
    assertSourced(positionsVocabulary.entries);
    assertSourced(lineupSlotsVocabulary.entries);

    for (const entry of positionsVocabulary.entries) {
      expect(ESPN_POSITION_BY_ID[entry.code]).toBe(entry.label);
    }
    for (const entry of lineupSlotsVocabulary.entries) {
      expect(ESPN_LINEUP_SLOT_BY_ID[entry.code]).toBe(entry.label);
    }

    const eraLabels = new Set(
      [
        ...positionsVocabulary.entries,
        ...lineupSlotsVocabulary.entries,
      ].flatMap((entry) => [
        entry.label,
        ...("historicalLabels" in entry ? (entry.historicalLabels ?? []) : []),
      ]),
    );
    for (const label of ["TQB", "WR/TE", "D/ST", "PK"]) {
      expect(eraLabels.has(label), `missing old-era label ${label}`).toBe(true);
    }
  });

  it("closes pro-team and activity dictionaries with canonical values", () => {
    assertNumericClosure(
      "pro team",
      ESPN_PRO_TEAM_BY_ID,
      proTeamsVocabulary.entries,
      dictionaryExceptions.proTeams,
    );
    assertNumericClosure(
      "activity",
      ESPN_ACTIVITY_BY_ID,
      activitiesVocabulary.entries,
      dictionaryExceptions.activities,
    );
    assertSourced(proTeamsVocabulary.entries);
    assertSourced(activitiesVocabulary.entries);

    for (const entry of proTeamsVocabulary.entries) {
      expect(ESPN_PRO_TEAM_BY_ID[entry.code]).toBe(entry.abbreviation);
    }
    for (const entry of activitiesVocabulary.entries) {
      expect(ESPN_ACTIVITY_BY_ID[entry.code]).toMatchObject({
        category: entry.category,
        id: entry.code,
        label: entry.label,
      });
    }
  });

  it("closes player-stat and scoring-stat dictionaries", () => {
    assertNumericClosure(
      "player stat",
      ESPN_PLAYER_STAT_KEY_BY_ID,
      playerStatsVocabulary.entries,
      dictionaryExceptions.playerStats,
    );
    assertNumericClosure(
      "scoring stat",
      ESPN_SCORING_STAT_BY_ID,
      scoringStatsVocabulary.entries,
      dictionaryExceptions.scoringStats,
    );
    assertSourced(playerStatsVocabulary.entries);
    assertSourced(scoringStatsVocabulary.entries);

    for (const entry of playerStatsVocabulary.entries) {
      expect(ESPN_PLAYER_STAT_KEY_BY_ID[entry.code]).toBe(entry.key);
    }
    for (const entry of scoringStatsVocabulary.entries) {
      expect(entry.abbreviation.trim().length).toBeGreaterThan(0);
      expect(entry.label.trim().length).toBeGreaterThan(0);
    }

    expect(scoringStatsVocabulary.entries[5]).toMatchObject({
      abbreviation: "PY5",
      code: 5,
      label: "Every 5 passing yards",
    });
    expect(scoringStatsVocabulary.entries[234]).toMatchObject({
      abbreviation: "FGAY100",
      code: 234,
      label: "Every 100 FG Attempt yards",
    });
  });

  it("records independently sourced mSettings families and the one-shape caveat", () => {
    assertSourced(leagueFormatVocabulary.entries);
    assertSourced(leagueFormatVocabulary.dynamicFields);

    const codesByKind = new Map<string, Set<string>>();
    for (const entry of leagueFormatVocabulary.entries) {
      const codes = codesByKind.get(entry.kind) ?? new Set<string>();
      codes.add(entry.code);
      codesByKind.set(entry.kind, codes);
    }

    expect(codesByKind.get("scoring_type")).toEqual(
      new Set(["H2H_POINTS", "TOTAL_POINTS"]),
    );
    expect(codesByKind.get("playoff_seeding_rule")).toContain(
      "TOTAL_POINTS_SCORED",
    );
    expect(codesByKind.get("draft_type")?.has("SNAKE")).toBe(true);
    expect(codesByKind.get("draft_type")?.has("AUCTION")).toBe(true);
    expect(codesByKind.get("league_sub_type")).toContain("KEEPER");
    expect(
      leagueFormatVocabulary.dynamicFields.map((entry) => entry.field),
    ).toEqual([
      "settings.scheduleSettings.divisions[].id",
      "settings.scheduleSettings.divisions[].name",
    ]);
    expect(leagueFormatVocabulary.coverageCaveat).toContain(
      "Only H2H_POINTS is present in the one committed sanitized league shape",
    );
  });
});
