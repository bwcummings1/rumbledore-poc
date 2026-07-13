import { describe, expect, it } from "vitest";
import league2025Fixture from "../../../test/fixtures/sleeper/league-2025.json";
import leagues2026Fixture from "../../../test/fixtures/sleeper/leagues-2026.json";
import playersFixture from "../../../test/fixtures/sleeper/players-nfl.json";
import transactionsWeek1Fixture from "../../../test/fixtures/sleeper/transactions-2026-week1.json";
import {
  decodeSleeperPosition,
  decodeSleeperProTeam,
  decodeSleeperRosterSlot,
  decodeSleeperScoringSetting,
  decodeSleeperTransactionType,
  encodeSleeperPosition,
  encodeSleeperProTeam,
  encodeSleeperRosterSlot,
  encodeSleeperScoringSetting,
  encodeSleeperTransactionType,
  SLEEPER_POSITION_BY_ID,
  SLEEPER_POSITION_MAP,
  SLEEPER_POSITION_VOCABULARY,
  SLEEPER_PRO_TEAM_BY_ID,
  SLEEPER_PRO_TEAM_MAP,
  SLEEPER_PRO_TEAM_VOCABULARY,
  SLEEPER_ROSTER_SLOT_BY_ID,
  SLEEPER_ROSTER_SLOT_MAP,
  SLEEPER_ROSTER_SLOT_VOCABULARY,
  SLEEPER_SCORING_SETTING_BY_ID,
  SLEEPER_SCORING_SETTING_VOCABULARY,
  SLEEPER_SCORING_SETTINGS_KEY_MAP,
  SLEEPER_TRANSACTION_TYPE_BY_ID,
  SLEEPER_TRANSACTION_TYPE_MAP,
  SLEEPER_TRANSACTION_TYPE_VOCABULARY,
  type SleeperVocabularyEntry,
} from "./reference-data";

function assertSourced(entries: readonly SleeperVocabularyEntry[]): void {
  expect(new Set(entries.map((entry) => entry.code)).size).toBe(entries.length);
  for (const entry of entries) {
    expect(entry.code.trim()).not.toBe("");
    expect(entry.source.trim()).not.toBe("");
  }
}

function assertClosure<T>({
  dictionary,
  encode,
  map,
  vocabulary,
}: {
  dictionary: Readonly<Partial<Record<number, T>>>;
  encode: (value: string) => number | undefined;
  map: Readonly<Record<string, T>>;
  vocabulary: readonly SleeperVocabularyEntry[];
}): void {
  assertSourced(vocabulary);
  expect(new Set(vocabulary.map(({ code }) => code))).toEqual(
    new Set(Object.keys(map)),
  );
  expect(Object.keys(dictionary)).toHaveLength(vocabulary.length);

  for (const { code } of vocabulary) {
    const id = encode(code);
    expect(id, `missing adapter id for ${code}`).toBeTypeOf("number");
    if (id === undefined) throw new Error(`missing adapter id for ${code}`);
    expect(dictionary[id], `missing numeric dictionary entry for ${code}`).toBe(
      map[code],
    );
  }
}

describe("Sleeper reference data", () => {
  it("decodes every string code carried by the Sleeper fixtures", () => {
    for (const league of [league2025Fixture, ...leagues2026Fixture]) {
      for (const slot of league.roster_positions) {
        expect(
          decodeSleeperRosterSlot(slot),
          `unknown fixture slot ${slot}`,
        ).toBe(slot);
      }
      for (const key of Object.keys(league.scoring_settings)) {
        expect(
          decodeSleeperScoringSetting(key),
          `unknown fixture scoring key ${key}`,
        ).toMatchObject({ key });
      }
    }
    for (const transaction of transactionsWeek1Fixture) {
      expect(
        decodeSleeperTransactionType(transaction.type),
        `unknown fixture transaction type ${transaction.type}`,
      ).toBeDefined();
    }
    for (const player of Object.values(playersFixture)) {
      expect(
        decodeSleeperPosition(player.position),
        `unknown fixture position ${player.position}`,
      ).toBe(player.position);
      for (const position of player.fantasy_positions) {
        expect(
          decodeSleeperRosterSlot(position),
          `unknown fixture eligible slot ${position}`,
        ).toBe(position);
      }
      expect(
        decodeSleeperProTeam(player.team),
        `unknown fixture pro team ${player.team}`,
      ).toBe(player.team);
    }
  });

  it("closes player positions including IDP and flex composites", () => {
    assertClosure({
      dictionary: SLEEPER_POSITION_BY_ID,
      encode: encodeSleeperPosition,
      map: SLEEPER_POSITION_MAP,
      vocabulary: SLEEPER_POSITION_VOCABULARY,
    });

    for (const code of [
      "QB",
      "DEF",
      "CB",
      "DT",
      "ILB",
      "IDP",
      "FLEX",
      "SUPER_FLEX",
      "WRRB_FLEX",
      "REC_FLEX",
      "IDP_FLEX",
    ]) {
      expect(decodeSleeperPosition(code.toLowerCase())).toBe(code);
    }
  });

  it("closes roster slots including bench, reserve, taxi, and IDP", () => {
    assertClosure({
      dictionary: SLEEPER_ROSTER_SLOT_BY_ID,
      encode: encodeSleeperRosterSlot,
      map: SLEEPER_ROSTER_SLOT_MAP,
      vocabulary: SLEEPER_ROSTER_SLOT_VOCABULARY,
    });

    for (const code of [
      "FLEX",
      "SUPER_FLEX",
      "WRRB_FLEX",
      "REC_FLEX",
      "IDP_FLEX",
      "BN",
      "IR",
      "TAXI",
    ]) {
      expect(decodeSleeperRosterSlot(code.toLowerCase())).toBe(code);
    }
  });

  it("closes current and historical NFL team codes with canonical aliases", () => {
    assertClosure({
      dictionary: SLEEPER_PRO_TEAM_BY_ID,
      encode: encodeSleeperProTeam,
      map: SLEEPER_PRO_TEAM_MAP,
      vocabulary: SLEEPER_PRO_TEAM_VOCABULARY,
    });

    expect(decodeSleeperProTeam("JAX")).toBe("JAX");
    expect(decodeSleeperProTeam("JAC")).toBe("JAX");
    expect(decodeSleeperProTeam("OAK")).toBe("LV");
    expect(decodeSleeperProTeam("SD")).toBe("LAC");
    expect(decodeSleeperProTeam("STL")).toBe("LAR");
    expect(decodeSleeperProTeam("WAS")).toBe("WSH");
  });

  it("closes documented transaction types and their normalized categories", () => {
    assertClosure({
      dictionary: SLEEPER_TRANSACTION_TYPE_BY_ID,
      encode: encodeSleeperTransactionType,
      map: SLEEPER_TRANSACTION_TYPE_MAP,
      vocabulary: SLEEPER_TRANSACTION_TYPE_VOCABULARY,
    });

    expect(decodeSleeperTransactionType("free_agent")?.category).toBe("add");
    expect(decodeSleeperTransactionType("waiver")?.category).toBe("waiver");
    expect(decodeSleeperTransactionType("trade")?.category).toBe("trade");
    expect(decodeSleeperTransactionType("commissioner")?.category).toBe(
      "commissioner",
    );
  });

  it("closes documented scoring_settings keys including IDP extensions", () => {
    assertClosure({
      dictionary: SLEEPER_SCORING_SETTING_BY_ID,
      encode: encodeSleeperScoringSetting,
      map: SLEEPER_SCORING_SETTINGS_KEY_MAP,
      vocabulary: SLEEPER_SCORING_SETTING_VOCABULARY,
    });

    expect(decodeSleeperScoringSetting("pass_yd")?.category).toBe("passing");
    expect(decodeSleeperScoringSetting("rec")?.category).toBe("receiving");
    expect(decodeSleeperScoringSetting("idp_tkl_solo")?.category).toBe("idp");
    expect(decodeSleeperScoringSetting("pts_allow_0")?.category).toBe(
      "defense",
    );
    expect(decodeSleeperScoringSetting("bonus_fd_qb")?.category).toBe("bonus");
  });

  it("assigns stable ids to unknown strings without adding them to dictionaries", () => {
    const unknownPosition = encodeSleeperPosition("MYSTERY_POSITION");
    const unknownSlot = encodeSleeperRosterSlot("MYSTERY_SLOT");

    expect(unknownPosition).toBeTypeOf("number");
    expect(unknownSlot).toBeTypeOf("number");
    expect(unknownPosition).toBeLessThan(0);
    expect(unknownSlot).toBeLessThan(0);
    expect(unknownPosition).not.toBe(unknownSlot);
    if (unknownPosition === undefined || unknownSlot === undefined) {
      throw new Error("unknown Sleeper adapter ids were not generated");
    }
    expect(SLEEPER_POSITION_BY_ID[unknownPosition]).toBeUndefined();
    expect(SLEEPER_ROSTER_SLOT_BY_ID[unknownSlot]).toBeUndefined();
    expect(decodeSleeperPosition("MYSTERY_POSITION")).toBeUndefined();
    expect(decodeSleeperRosterSlot("MYSTERY_SLOT")).toBeUndefined();
  });
});
