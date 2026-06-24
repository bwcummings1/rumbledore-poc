# ESPN Data-Decoding Audit — toward complete, adaptive league-data organization

> **Status:** DIAGNOSIS (no code changes). Owner-aligned principle: the system must correctly decode + organize
> **any** ESPN league type/format/roster/position ESPN has ever offered — sourced from the **complete authoritative
> vocabulary**, NOT inferred from one league. The owner's league is a *validation set*, not the source.

## Principle (locked)
1. **Complete vocabulary.** Reference dictionaries (positions, lineup slots, pro teams, scoring stats, acquisition
   types) are the FULL ESPN enumeration — authoritative source = `cwendt94/espn-api` constants + ESPN's API.
2. **Canonical, provider-agnostic model.** Each provider's codes decode into OUR vocabulary, so ESPN/Sleeper/Yahoo
   map into one shape; adding a provider = writing its dictionary.
3. **Settings-driven organization.** Each league's Data Book layout is driven by ITS actual settings (the roster
   slots/scoring/positions it uses — already captured in `league_season_settings`, T1), per season.
4. **Coverage invariant (self-audit).** Any UNDECODED code on import **flags** (a `data_integrity_check`) instead of
   silently producing `unknown`/garbage — so an unanticipated format surfaces, never breaks quietly. (T13 philosophy.)

## Authoritative complete ESPN vocabulary (source: cwendt94/espn-api)
**Positions / slots (one shared id space — ESPN uses these for both `defaultPositionId` and lineup-slot/eligibleSlots):**
`0 QB · 1 TQB · 2 RB · 3 RB/WR · 4 WR · 5 WR/TE · 6 TE · 7 OP(superflex) · 8 DT · 9 DE · 10 LB · 11 DL · 12 CB ·
13 S · 14 DB · 15 DP · 16 D/ST · 17 K · 18 P · 19 HC · 20 BE(bench) · 21 IR · 23 RB/WR/TE(FLEX) · 24 ER · 25 Rookie`
**Pro teams:** full 32 incl. relocations/renames: `13 LV · 14 LAR · 24 LAC · 28 WSH · 33 BAL · 34 HOU` (+ 0 = FA/None).
**Acquisition / ACTIVITY:** `178 FA-add · 180 waiver-add · 179/181/239 drop · 244 trade`.
**Scoring `PLAYER_STATS_MAP`:** ~200 stat ids — passing 0–22, rushing 23–40, receiving 41–61, turnovers 62–73,
kicking 74–88, defense 89–136, punting 138–154, head-coach 155–174, misc 201–206.

## Our current state vs. complete (the GAPS)
| Variable | Authoritative | Ours today (`src/providers/espn/client.ts`) | Gap |
|---|---|---|---|
| **Position id→name** | 0–25 incl. IDP + flex variants | `ESPN_POSITION_BY_ID`: 7 entries, AND **wrong**: `3=WR`(→RB/WR), `4=TE`(→WR), `5=K`(→WR/TE) | **Incorrect** for 3/4/5; missing 6,7,8–15,17,18,19,23,25 → wrong + `unknown` positions |
| **Lineup slot id→name** | full set incl. IDP slots, flex variants, P/HC/Rookie | `ESPN_LINEUP_SLOT_BY_ID`: 11 entries (mostly right) | Missing 1,3,5,8–15,18,19,25 → `unknown`/wrong slots for IDP/custom |
| **Pro team id→abbr** | full 32 incl. relocations | `ESPN_PRO_TEAM_BY_ID`: partial | Verify completeness incl. LV/LAC/LAR/WSH/BAL/HOU |
| **Scoring stat id→category** | ~200 stat ids | **none** | We store points only — no per-category scoring breakdown |
| **Acquisition/transaction types** | ACTIVITY_MAP | not decoded | adds/drops/waivers/trades not categorized |
| **Higher-level settings** (roster limits, scoring type, playoff/division config, keeper/dynasty, FAAB/auction) | in `mSettings` | partially captured (T1: size, playoff length, lineupSlotCounts, scoring type, acquisition) | enumerate + decode the rest; drive organization from them |

## Validation against real data (owner league 95050)
Symptoms already observed in the T14 player sample confirm the gaps: IDP/OP seasons (2011–2012) produced `unknown`
positions (e.g. NaVorro Bowman = LB, id 10 — absent from our map) and a mis-labeled lineup slot (TE shown in a "QB"
slot). **Action:** on the next real import, dump the DISTINCT `defaultPositionId`/`lineupSlotId`/`stat id` values that
appear across all 16 seasons and confirm the complete dictionary covers 100% (the league is a coverage check, not the
source — the dictionary must also cover formats this league never used).

## Proposed fix (the build, after review)
1. **Complete + correct the dictionaries** — replace the partial/buggy maps with the full ESPN enumerations
   (positions, slots, pro teams, the `PLAYER_STATS_MAP`, ACTIVITY_MAP). Single source of truth; typed.
2. **Canonical model** — decode provider codes → canonical position/slot/scoring/transaction vocabulary; per-provider
   dictionary boundary so Sleeper/Yahoo plug in later.
3. **Settings-driven organization** — Data Book + records organize per each league's actual settings/season.
4. **Coverage invariant** — a `data_integrity_check` that fails/flags on ANY undecoded position/slot/stat/team/activity
   id, so gaps surface immediately and never ship as `unknown`.
5. **Backfill-safe** — re-decode is idempotent (T13) so re-importing corrects historical rows.

## Impact on the data system we built (T4–T14) — verified, before any change
The fix lives in the **ingestion/normalization layer** (how provider codes decode into values). Verified against the
code, it is **orthogonal to the data/records architecture**:
- **Pushed snapshot / Record Book (T9–T11): UNAFFECTED.** `CuratedSeasonSnapshot` is team/person/matchup/settings-level
  only — it does NOT contain player/roster data. The Record Book reads that snapshot, so correcting player
  position/slot/scoring decoding does not touch records, the lens, or the catalog. (Future *player-level* records
  would benefit, but none exist yet.)
- **Curated-state / save-push / Edit Ledger (T4, T7, T8): UNAFFECTED.** They operate on persons/teams/matchups/settings
  — not player codes. No re-push is required by the player-decoding fix (player data isn't in the snapshot).
- **Data Book — People & Settings grains: ~unaffected** (settings get correct slot *labels* — display only; the raw
  ids/era signature are unchanged). **Weeks/rosters grain (T14): IMPROVES** — it reads live `fantasy_roster_entries`,
  so correct positions/slots appear on **re-import, with no re-push.**
- **Era auto-proposal (T10): UNAFFECTED structurally** — it compares raw `lineupSlotCounts` id signatures, not labels.
- **Clean-import guarantee (T13): COMPLEMENTARY** — the new coverage invariant is the same philosophy as T13's
  provider-id invariant; T13's idempotent reconciliation makes re-decoding/backfill safe.
- **Player-depth (T14): the captured data gets CORRECTED** (positions/slots/scoring) — the intended improvement.
- **Schema:** position/`proTeam` are existing text columns → value corrections (no destructive change); the per-stat
  **scoring breakdown is NEW (additive tables/columns)**; nothing existing is dropped.

**Careful points (deliberate, not risky):** (1) backfill = a **re-import** to correct historical rows — idempotent per
T13, **no re-push needed**; (2) **sequence** the coverage invariant to turn on *after* re-decoding so it doesn't flag
stale rows; (3) **maintenance** — update tests/fixtures that assert old position values + refresh the Data Book Weeks
screenshot. Net: low architectural risk; additive + corrective at the ingestion layer; the only visible behavior change
is the Data Book rosters showing correct positions/slots.

## Scope
ESPN first (we have real data) — complete + correct + coverage-guarded. Sleeper/Yahoo = a dictionary each, same
canonical model, later. This is a general data-correctness foundation, not a per-league patch.
