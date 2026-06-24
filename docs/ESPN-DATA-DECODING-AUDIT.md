# ESPN Data-Decoding Audit — toward complete, adaptive league-data organization

> **Status:** T15 CLOSED. Owner-aligned principle: the system must correctly decode + organize
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
T15 also canonicalizes cwendt's blank id `22` sentinel as `N/A` because real `eligibleSlots` payloads expose it.
**Pro teams:** full 32 incl. relocations/renames: `13 LV · 14 LAR · 24 LAC · 28 WSH · 33 BAL · 34 HOU` (+ 0 = FA/None).
**Acquisition / ACTIVITY:** `178 FA-add · 180 waiver-add · 179/181/239 drop · 244 trade`.
**Scoring `PLAYER_STATS_MAP`:** ~200 stat ids — passing 0–22, rushing 23–40, receiving 41–61, turnovers 62–73,
kicking 74–88, defense 89–136, punting 138–154, head-coach 155–174, misc 201–206.

## Our current state vs. complete (the GAPS)
| Variable | Authoritative | Ours today (`src/providers/espn/client.ts`) | Gap |
|---|---|---|---|
| **Position id→name** | 0–25 incl. IDP + flex variants | **T15 closed:** `src/providers/espn/reference-data.ts` owns the full map; `3=RB/WR`, `4=WR`, `5=WR/TE`; id `22=N/A` sentinel | Closed |
| **Lineup slot id→name** | full set incl. IDP slots, flex variants, P/HC/Rookie | **T15 closed:** same reference module owns slots incl. IDP, OP, FLEX, ER, Rookie, and `22=N/A`; Data Book labels use it | Closed |
| **Pro team id→abbr** | full 32 incl. relocations | **T15 closed:** full cwendt map incl. LV/LAR/LAC/WSH/BAL/HOU and `0=FA` | Closed |
| **Scoring stat id→category** | ~200 stat ids | **T15 closed:** scoring stat ids decode to canonical categories and keys; scoring settings persist decoded `providerStatId`/`statCategory`/`statKey` | Full per-player stat breakdown table remains follow-on |
| **Acquisition/transaction types** | ACTIVITY_MAP | **T15 closed:** numeric and string activity values decode to canonical add/drop/waiver/trade categories | Closed |
| **Higher-level settings** (roster limits, scoring type, playoff/division config, keeper/dynasty, FAAB/auction) | in `mSettings` | partially captured (T1: size, playoff length, lineupSlotCounts, scoring type, acquisition) | enumerate + decode the rest; drive organization from them |

## Validation against real data (owner league 95050)
T15 verification reset and re-imported ESPN 95050 across all 16 seasons (2011–2026). The distinct observed
`defaultPositionId`/lineup-slot/eligible-slot/pro-team/scoring-stat/activity ids are written under
`.orchestration/import-summary.md` → **T15 decoding coverage**. The real import has `provider_code_decoding` PASS,
zero decoded player-position/pro-team/roster-slot `unknown` values, and the synthetic `999` position/slot/proTeam/stat/
activity probe flags as expected.

## T15 implementation
1. **Complete + correct dictionaries** — `src/providers/espn/reference-data.ts` is the ESPN source of truth for
   positions, lineup slots, pro teams, activity codes, and scoring stat categories/keys.
2. **Canonical provider boundary** — `src/providers/decoding.ts` exposes provider-code coverage checks; Sleeper/Yahoo
   become "add a dictionary" follow-ons.
3. **Decode path** — ESPN normalization uses the shared dictionaries for player position/pro team, eligible slots,
   roster slots, draft slot metadata, scoring settings, and transaction activity category.
4. **Settings-driven labels** — the Data Book Settings grain formats lineup slot counts through the shared dictionary
   while preserving raw numeric ids for signatures/era detection.
5. **Coverage invariant** — `provider_code_decoding` in `data_integrity_check` flags any undecoded ESPN position,
   lineup slot, pro team, scoring stat, or activity id observed after import; stale pass/fail rows are replaced on rerun.
6. **Backfill-safe** — no curated snapshot/save-push/Record Book state changed. Re-importing rewrites normalized player
   rows idempotently and fixes live Data Book Weeks roster labels without re-pushing curated seasons.

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
