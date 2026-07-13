# Real League Import Summary

- League: ESPN 95050
- Current season synced: 2026
- Historical seasons requested in one import: 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016, 2015, 2014, 2013, 2012, 2011
- Settings rows: 16
- Integrity failures: 0
- Record rows: 101
- Record book aggregate rows: 15

## Verification Checks

- PASS - settings rows present for 16 seasons
- PASS - league size changes 10 to 12 in 2013
- PASS - playoffMatchupPeriodLength is 2 for 2011-2012
- PASS - regular-season weeks change 13 to 14 in 2021
- PASS - lineup slot signature moves OP to FLEX
- PASS - persons list is scoped to imported league and has no fixture managers
- PASS - person identities collapse across historical seasons
- PASS - at least one identity spans ten or more seasons
- PASS - schedule_coverage integrity checks all pass
- PASS - record book materialized records and aggregates
- PASS - single-week score record excludes the 2-week 325
- PASS - 2011-2012 playoff matchups are stored with span=2

## Integrity

- schedule_coverage failures: 0
- total integrity failures: 0
- All integrity checks PASS.

## Record Book

- All-time records rows: 101
- Record book all-time standings rows: 14
- Record book milestone rows: 1
- Stats records written/updated: 101
- Stats aggregate rows written/updated: 15
- Current highest single-week score: 198.4 by w hardy in 2020 week 16
- 325 excluded as single-week record: PASS

## Multi-Week Spans

| Season | Span=2 matchup rows | Max stored span=2 score |
|---:|---:|---:|
| 2011 | 10 | 309 |
| 2012 | 10 | 325 |

## Season Settings

| Season | Size | Reg Weeks | Playoff Teams | Playoff Length | Scoring | Acquisition | Budget | OP(7) | FLEX(23) |
|---:|---:|---:|---:|---:|---|---|---:|---:|---:|
| 2011 | 10 | 13 | 4 | 2 | H2H_POINTS | FREEAGENCY | 100 | 1 | 0 |
| 2012 | 10 | 13 | 4 | 2 | H2H_POINTS | FREEAGENCY | 100 | 1 | 0 |
| 2013 | 12 | 13 | 6 | 1 | H2H_POINTS | FREEAGENCY | 100 | 1 | 0 |
| 2014 | 12 | 13 | 6 | 1 | H2H_POINTS | FREEAGENCY | 100 | 1 | 0 |
| 2015 | 12 | 13 | 6 | 1 | H2H_POINTS | WAIVERS_TRADITIONAL | 100 | 1 | 0 |
| 2016 | 12 | 13 | 6 | 1 | H2H_POINTS | WAIVERS_TRADITIONAL | 100 | 1 | 1 |
| 2017 | 12 | 13 | 6 | 1 | H2H_POINTS | WAIVERS_TRADITIONAL | 100 | 1 | 1 |
| 2018 | 12 | 13 | 6 | 1 | H2H_POINTS | WAIVERS_TRADITIONAL | 100 | 1 | 1 |
| 2019 | 12 | 13 | 6 | 1 | H2H_POINTS | WAIVERS_TRADITIONAL | 100 | 1 | 1 |
| 2020 | 12 | 13 | 6 | 1 | H2H_POINTS | WAIVERS_TRADITIONAL | 100 | 0 | 2 |
| 2021 | 12 | 14 | 6 | 1 | H2H_POINTS | WAIVERS_TRADITIONAL | 100 | 0 | 2 |
| 2022 | 12 | 14 | 6 | 1 | H2H_POINTS | WAIVERS_TRADITIONAL | 100 | 0 | 2 |
| 2023 | 12 | 14 | 6 | 1 | H2H_POINTS | WAIVERS_TRADITIONAL | 100 | 0 | 2 |
| 2024 | 12 | 14 | 6 | 1 | H2H_POINTS | WAIVERS_CONTINUOUS | 100 | 0 | 2 |
| 2025 | 12 | 14 | 6 | 1 | H2H_POINTS | WAIVERS_TRADITIONAL | 100 | 0 | 2 |
| 2026 | 12 | 14 | 6 | 1 | H2H_POINTS | WAIVERS_TRADITIONAL | 100 | 0 | 2 |

## Persons

- Persons: 14
- Team seasons: 188
- Identity mappings: 188
- Max seasons on one identity: 16

| Person | Seasons | Owner Names | Team Names |
|---|---:|---|---|
| bradwcummings | 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026 | bradwcummings | Ain't Nobody Safe, Big Jiggums, Big Lurches, Glasgow Diamonds |
| bsarto5 | 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026 | bsarto5, espn04100126 | How Ya Mom An Nem |
| Burch 16 | 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026 | Burch 16 | Laces Out Marino, LACES OUT MARINO |
| espn52782328 | 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026 | espn52782328, jeezyfbaby | A Gurley Has No Name, Team FancyChocolates, Team Kujo, Team Luka Brasi, Uh Oh |
| garrettreno36 | 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026 | garrettreno36 | Annex Chee-Weez, CeeDeez Nutz, Chicken N Waffles, Crispy Fried Chicken, Johnny's Pizza, JUICE  BOX, Maple  Syrup, Pancake  Villains, Pancake  Villains XL, Slayer Crushers, Sundae Retrievers, Team HAM |
| GucciMane1733 | 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026 | GucciMane1733, RaphRhymes4 | Gucci Mane Tha G, Ray's  Boom Boom Room, Team Can't  Get Right |
| Mark Kent Anderson | 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026 | Mark Kent Anderson, mkalsu12 | Beast Squad |
| maverick_fan2007 | 2013, 2014, 2015, 2016, 2017, 2018, 2019 | maverick_fan2007 | PAT MaGooch, Team MaGooch |
| MONROE_REBS | 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026 | MONROE_REBS | Drake London on the Track, I've Won Three Times, Mrs. Brown's Art Class, Poo Narmour, Team DOMTINATION |
| Squyres18 | 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026 | Squyres18 | Aint No Middle Tha Mall Squad, Fear the Beard, Krispy Kareem, Shake and Bake, Team Trailer Park Boyz, Turn Down for Watt |
| truman1109 | 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026 | truman1109 | He Man  Woman Haters, Pink  Shinin', The Truman Show |
| w hardy | 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026 | w hardy | Shady's Head Bangers, Started From Tha Bottom |
| ZachKirksey21 | 2020, 2021, 2022, 2023, 2024, 2025, 2026 | ZachKirksey21 | 2KIRKS, HOUSE LAMARGARYEN, KIRK'S COVID KILLERS, KOO KIDS NABERHOOD |
| zachlawrence09 | 2011 | zachlawrence09 | Monroe BALLERS |

## Import Stats

- Current teams changed/total: 12/12
- Current matchups changed/total: 84/84
- Historical imported seasons: 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016, 2015, 2014, 2013, 2012, 2011
- Historical skipped seasons: (none)
- Historical teams changed/total: 176/176
- Historical matchups changed/total: 1441/1441
- Stats weekly rows: 2856
- Stats season rows: 176
- Stats integrity failures: 0

## 47C capability map

- Verification date: 2026-07-13
- Scope: `specs/47` §D/§E, acceptance criteria 6–9.
- Safety posture: the committed ESPN fixture exercised the product connect → current sync → full-history shadow import
  → integrity → live path. The shared ESPN `95050` database evidence below was queried inside `BEGIN READ ONLY`; the
  destructive reset harness was not used and the track's no-live-provider-call rule was preserved.
- Fixture product-path result: clean shadow import promoted atomically to live; flagship ESPN onboarding E2E passed in
  28.1s. Preseason fallback standings were recorded as explicit `season_not_complete` PASS detail rather than false
  postseason/standings failures.
- Capability observations: 176 latest dimensions = 16 seasons × 11 provider data classes.
- Player depth (`rosters`): `partial` + `returned_data` for 2011–2017 and 2026; `none` + `returned_empty` for
  2018–2025. Measured row counts were 3,611 / 3,589 / 3,641 / 3,581 / 3,266 / 3,213 / 3,347 for 2011–2017 and 185 for
  2026.
- Per-stat breakdowns: `playerStatBreakdownRows=6,230` for 2026 and `0` for every 2011–2025 season. Historical
  `scoring_detail` retains the single settings payload row while the player-stat expectation is explicitly absent.
- Latest integrity rows: 136 PASS, 0 FAIL, 0 REVIEWED/non-pass.
- Decoding audit: 0 unknown player positions, 0 unknown player pro teams, 0 unknown roster slots.
- UI evidence refreshed: `10-records.png`, `15-data-steward.png`, `17-data-book.png`, and
  `17-data-book-settings.png` at mobile/tablet/desktop viewports; the steward fixture includes an active additive +
  semantic drift alert.
