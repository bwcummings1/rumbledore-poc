# Real League Import Summary

- League: ESPN 95050
- Current season synced: 2026
- Historical seasons requested in one import: 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016, 2015, 2014, 2013, 2012, 2011
- Settings rows: 16
- Integrity failures: 0
- Record rows: 69
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

- All-time records rows: 69
- Record book all-time standings rows: 14
- Record book milestone rows: 1
- Stats records written/updated: 69
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
| Burch 16 | 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026 | Burch 16 | LACES OUT MARINO, Laces Out Marino |
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

## T9 Vertical Slice

- League row: NHS Alumni Annual (fe9369ac-d3bf-4d4c-8bc4-6e04a637efa5)
- Baseline pushed seasons: 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026
- 2012 edit target: week 8, 179 -> 249
- Before push highest weekly score: 198.4 (2020 week 16)
- Saved-not-pushed highest weekly score: 198.4
- After 2012 push highest weekly score: 249 (2012 week 8)
- Display sample: The Truman Show (truman1109)
- Data-defined era options on pushed snapshot: 0

## T9 Checks

- PASS - nothing pushed shows empty record-book data
- PASS - baseline push composed every imported season
- PASS - saved 2012 score edit stayed invisible before push
- PASS - pushed 2012 score edit became the record-book high score
- PASS - pushing 2012 preserved every other pushed season
- PASS - display rule collapsed to latest team name plus real name

## T10 Era Proposals

- League DB id: 466e2035-6c78-451a-b517-bcc5accae436
- Proposed eras: 6
- Confirmed for screenshot lens: 12-team era (2013-2014) (2013, 2014)
- Pushed seasons after confirmation: 16

### Detector Checks

- PASS - detector proposes the 2011-2012 2-week playoff era
- PASS - detector proposes a 2013 team-count boundary
- PASS - detector proposes the OP-to-FLEX lineup boundary
- PASS - detector proposes the playoff-team-count boundary
- PASS - detector proposes the 2021 regular-season-week boundary
- PASS - detector does not propose regular/playoff segments as eras
- PASS - confirmed grouping is present in the pushed snapshot

### Proposals

- PROPOSED - 2-week playoffs (2011-2012): 2011, 2012 - 2011-2012 share 10 teams, 2-week playoffs, 4 playoff teams, 13 regular-season weeks, OP lineup.
- CONFIRMED - 12-team era (2013-2014): 2013, 2014 - Boundary starts at 2013: team count changed 10 -> 12; playoff matchup length changed 2 -> 1 week(s); playoff field changed 4 -> 6 teams; lineup slot counts changed within OP lineup. 2013-2014 share 12 teams, 1-week playoffs, 6 playoff teams, 13 regular-season weeks, OP lineup.
- PROPOSED - OP lineup era (2015): 2015 - Boundary starts at 2015: lineup slot counts changed within OP lineup. 2015 shares 12 teams, 1-week playoffs, 6 playoff teams, 13 regular-season weeks, OP lineup.
- PROPOSED - OP/FLEX hybrid lineup era (2016-2019): 2016, 2017, 2018, 2019 - Boundary starts at 2016: lineup slots changed from OP lineup to OP/FLEX hybrid lineup. 2016-2019 share 12 teams, 1-week playoffs, 6 playoff teams, 13 regular-season weeks, OP/FLEX hybrid lineup.
- PROPOSED - FLEX lineup era (2020): 2020 - Boundary starts at 2020: lineup slots changed from OP/FLEX hybrid lineup to FLEX lineup. 2020 shares 12 teams, 1-week playoffs, 6 playoff teams, 13 regular-season weeks, FLEX lineup.
- PROPOSED - 14-week regular season (2021-present): 2021, 2022, 2023, 2024, 2025, 2026 - Boundary starts at 2021: regular season changed 13 -> 14 weeks. 2021-2026 share 12 teams, 1-week playoffs, 6 playoff teams, 14 regular-season weeks, FLEX lineup.

## T11 Records Catalog

- League row: NHS Alumni Annual (466e2035-6c78-451a-b517-bcc5accae436)
- Lens: both, cumulative
- All-time rows: 14
- Regular standings rows: 14
- Playoff standings rows: 14
- H2H rivalry rows: 86
- Achievement high-season rows: 10
- Lowlight biggest-loss rows: 10

### Sample Records

- Regular leader: Monroe BALLERS (zachlawrence09) 8-5-0, PF 1,624
- Playoff leader: KOO KIDS NABERHOOD (ZachKirksey21) 12-5-0, PF 2,271.10
- H2H sample: The Truman Show (truman1109) vs Ray's  Boom Boom Room (GucciMane1733), 34 meetings
- Highest weekly score: 198.40 (Started From Tha Bottom (w hardy), 2020, week 16)
- Lowest weekly score: 38 (Mrs. Brown's Art Class (MONROE_REBS), 2014, week 16)
- Biggest loss: 138.20 (LACES OUT MARINO (Burch 16), 2015, week 15)
- Biggest loss list: LACES OUT MARINO (Burch 16) lost by 138.20 in 2015 week 15

### T11 Checks

- PASS - regular-season category has standings
- PASS - playoff category has postseason rows
- PASS - head-to-head category has rivalries
- PASS - achievements category has high marks
- PASS - lowlights category has worst records
- PASS - new lowlight current records are present

## T12 Substrate B

- Source: mock-nfl-general-stats (mock/$0)
- First ingest changed rows: players 4/4, schedule 4/4, team stats 8/8, player week stats 8/8
- Persisted rows: players 4, schedule 4, team stats 8, player week stats 8
- Idempotent second ingest changed rows: players 0, schedule 0, team stats 0, player week stats 0
- Provenance sample: mock-nfl-general-stats fetched_at=2026-06-23T10:26:57.088Z

### Consumer Samples

- Player by source id: Patrick Mahomes QB KC
- Player by provider id: CeeDee Lamb WR DAL
- Name lookup: Justin Jefferson
- Patrick Mahomes week 2 fantasy points: 27.78
- DAL week 2 points: 30
- KC schedule rows: 2
- Enrichment: Patrick Mahomes QB via provider_id

### T12 Checks

- PASS - fixture integrity passes
- PASS - mock ingest populated all four B tables
- PASS - second ingest is idempotent for unchanged facts
- PASS - provenance source and fetched_at are present
- PASS - player/provider/name reads resolve expected players
- PASS - week/team/schedule reads return typed facts
- PASS - roster enrichment maps provider player id to identity

## T13 import-integrity

- Verified at: 2026-06-23T19:33:28.514Z
- Real provider identity: ESPN 95050, season 2026

### Fresh/empty DB

- Fresh database: rumbledore_t13_1782243187371_4019768
- Imported league id: 023e5f5c-0a27-4421-9501-3b975c8fc63a
- Settings rows: 16
- Persons: 14
- Fantasy members: 219
- Team seasons: 188
- PASS - all 16 settings seasons imported
- PASS - no invalid ESPN member ids
- PASS - no Fixture/Screenshot member names
- PASS - no Fixture/Screenshot canonical person names
- PASS - provider_identity_contamination invariant passes
- PASS - all integrity checks pass
- PASS - re-import counts are stable

### Contaminated -> clean dev DB

- Dev league id: 466e2035-6c78-451a-b517-bcc5accae436
- Pre-existing invalid members: 0
- Contaminated invalid members before clean: 1
- Contaminated placeholder members before clean: 1
- Invalid members after clean: 0
- Placeholder members after clean: 0
- Placeholder persons after clean: 0
- PASS - contamination was present before clean path
- PASS - invalid member ids removed
- PASS - placeholder member rows removed
- PASS - placeholder canonical persons removed
- PASS - provider_identity_contamination invariant passes after clean
- Real person samples after clean: bradwcummings, bsarto5, Burch 16, espn52782328, garrettreno36, GucciMane1733, Mark Kent Anderson, maverick_fan2007

## T14 player-depth

- Real provider identity: ESPN 95050, current season 2026; sample season 2012, week 8.
- League id: e4323c97-0c3f-4f24-82d3-3794bd928b26
- Current import rosters changed/total: 185/185
- Historical import rosters changed/total: 3589/3589
- Historical import draft picks changed/total: 200/200
- Historical import transactions changed/total: 0/0

### Counts

- fantasy_players: 413
- fantasy_roster_entries: 3774 (3589 in 2012)
- fantasy_draft_picks: 380 (200 in 2012)
- fantasy_transactions: 0 imported; ESPN returned no transactions for this league through mTransactions2 with the transaction filter
- Counts after first import: {"draftPicks":380,"draftPicks2012":200,"fantasyPlayers":413,"rosterEntries":3774,"rosterEntries2012":3589,"transactions":0,"transactions2012":0}
- Counts after replay: {"draftPicks":380,"draftPicks2012":200,"fantasyPlayers":413,"rosterEntries":3774,"rosterEntries2012":3589,"transactions":0,"transactions2012":0}

### Verification Checks

- PASS - 2012 roster entries imported
- PASS - 2012 draft picks imported
- PASS - 2012 week 8 roster sample loaded
- PASS - idempotent real-season replay kept counts stable
- PASS - T14 roster integrity checks pass
- WARN - ESPN returned no real transaction rows for this league; parser and persistence tests cover mTransactions2 rows

### Week 8 Roster Sample

- Team: Team DOMTINATION

| Player | Pos | Pro | Slot | Started | Actual | Projected |
|---|---|---|---|---:|---:|---:|
| Bills D/ST | D/ST | BUF | D/ST | yes |  |  |
| Matt Prater | K | DEN | K | yes |  |  |
| Cam Newton | TQB | CAR | OP | yes |  |  |
| Jared Cook | TE | TEN | QB | yes | 4 |  |
| NaVorro Bowman | unknown | SF | QB | yes | 3 |  |
| Aaron Rodgers | TQB | GB | QB | yes | 13 |  |
| DeMarco Murray | RB | DAL | RB | yes |  |  |
| Doug Martin | RB | TB | RB | yes | 32 |  |
| Jason Witten | TE | DAL | TE | yes |  |  |
| Darren McFadden | RB | LV | unknown | yes | 13 |  |
| Danario Alexander | WR | LAC | unknown | yes |  |  |
| Luke Kuechly | unknown | CAR | unknown | yes |  |  |
| Antonio Brown | WR | PIT | WR | yes | 3 |  |
| Vincent Jackson | WR | TB | WR | yes | 4 |  |
| Sidney Rice | WR | SEA | BE | no |  |  |
| Danny Amendola | WR | LAR | BE | no |  |  |
| BenJarvus Green-Ellis | RB | CIN | BE | no |  |  |
| Kenny Britt | WR | TEN | BE | no | 3 |  |
| Andrew Luck | TQB | IND | BE | no | 15 |  |
| Jets D/ST | D/ST | NYJ | BE | no |  |  |
| Darren Sproles | RB | NO | BE | no | 11 |  |
| Ryan Grant | RB | GB | BE | no |  |  |

### Draft Sample

| Overall | Round | Team | Player | Pos |
|---:|---:|---|---|---|
| 1 | 1 | 4 | Arian Foster | RB |
| 2 | 1 | 2 | Ray Rice | RB |
| 3 | 1 | 1 | Aaron Rodgers | TQB |
| 4 | 1 | 3 | LeSean McCoy | RB |
| 5 | 1 | 5 | Maurice Jones-Drew | RB |

### Transaction Sample

- ESPN returned no transaction rows for the verified league. Parser and persistence coverage use representative mTransactions2 payloads; follow-on UI can consume rows when ESPN exposes them.

### Integrity

- Stats weekly rows: 150
- Stats season rows: 10
- Integrity checks written: 17
- Total integrity failures: 0
- T14 roster/player integrity failures: 0
- All integrity checks PASS.

## T15 decoding coverage

- Real provider identity: ESPN 95050, current season 2026, imported seasons 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026.
- League id: f8334edb-7a20-4138-aa7a-65c0b5285886
- Current import rosters changed/total: 185/185
- Historical import rosters changed/total: 24248/24248
- Stats recompute integrity failures: 0

### Distinct ESPN Codes Observed

- defaultPositionId: 1:TQB, 2:RB, 3:RB/WR, 4:WR, 5:WR/TE, 11:DL, 16:D/ST
- lineupSlotId/eligible/settings slots: 0:QB, 1:TQB, 2:RB, 3:RB/WR, 4:WR, 5:WR/TE, 6:TE, 7:OP, 8:DT, 9:DE, 10:LB, 11:DL, 12:CB, 13:S, 14:DB, 15:DP, 16:D/ST, 17:K, 18:P, 19:HC, 20:BE, 21:IR, 22:N/A, 23:FLEX, 24:ER, 25:Rookie
- proTeamId: 0:FA, 1:ATL, 2:BUF, 3:CHI, 4:CIN, 5:CLE, 6:DAL, 7:DEN, 8:DET, 9:GB, 10:TEN, 11:IND, 12:KC, 13:LV, 14:LAR, 15:MIA, 16:MIN, 17:NE, 18:NO, 19:NYG, 20:NYJ, 21:PHI, 22:ARI, 23:PIT, 24:LAC, 25:SF, 26:SEA, 27:TB, 28:WSH, 29:CAR, 30:JAX, 33:BAL, 34:HOU
- scoring statId: 4:passing/passingTouchdowns, 5:passing/passingStat5, 8:passing/passingStat8, 19:passing/passing2PtConversions, 20:passing/passingInterceptions, 24:rushing/rushingYards, 25:rushing/rushingTouchdowns, 26:rushing/rushing2PtConversions, 28:rushing/rushingStat28, 42:receiving/receivingYards, 43:receiving/receivingTouchdowns, 44:receiving/receiving2PtConversions, 48:receiving/receivingStat48, 53:receiving/receivingReceptions, 63:turnover/fumbleRecoveredForTD, 72:turnover/lostFumbles, 74:kicking/madeFieldGoalsFrom50Plus, 77:kicking/madeFieldGoalsFrom40To49, 80:kicking/madeFieldGoalsFromUnder40, 85:kicking/missedFieldGoals, 86:kicking/madeExtraPoints, 89:defense/defensive0PointsAllowed, 90:defense/defensive1To6PointsAllowed, 91:defense/defensive7To13PointsAllowed, 92:defense/defensive14To17PointsAllowed, 93:defense/defensiveBlockedKickForTouchdowns, 95:defense/defensiveInterceptions, 96:defense/defensiveFumbles, 97:defense/defensiveBlockedKicks, 98:defense/defensiveSafeties, 99:defense/defensiveSacks, 101:defense/kickoffReturnTouchdowns, 102:defense/puntReturnTouchdowns, 103:defense/interceptionReturnTouchdowns, 104:defense/fumbleReturnTouchdowns, 106:defense/defensiveForcedFumbles, 109:defense/defensiveTotalTackles, 123:defense/defensive28To34PointsAllowed, 124:defense/defensive35To45PointsAllowed, 125:defense/defensive45PlusPointsAllowed, 128:defense/defensiveLessThan100YardsAllowed, 129:defense/defensive100To199YardsAllowed, 130:defense/defensive200To299YardsAllowed, 132:defense/defensive350To399YardsAllowed, 133:defense/defensive400To449YardsAllowed, 134:defense/defensive450To499YardsAllowed, 135:defense/defensive500To549YardsAllowed, 136:defense/defensive550PlusYardsAllowed, 198:kicking/kickingStat198, 201:kicking/madeFieldGoalsFrom60Plus
- activity id: (none observed)

### Previously Broken Cases

| Season | Week | Player | Pos | Pro | Slot |
|---:|---:|---|---|---|---|
| 2012 | 1 | Luke Kuechly | DL | CAR | LB |
| 2012 | 1 | Lance Briggs | DL | CHI | LB |
| 2012 | 1 | Jerod Mayo | DL | NE | LB |
| 2012 | 1 | James Laurinaitis | DL | LAR | LB |
| 2012 | 1 | Derrick Johnson | DL | KC | LB |
| 2012 | 1 | D'Qwell Jackson | DL | CLE | LB |
| 2012 | 1 | Chad Greenway | DL | MIN | LB |
| 2012 | 1 | Curtis Lofton | DL | ATL | LB |

### Verification Checks

- PASS - provider_code_decoding passes on real ESPN import
- PASS - decoded player position/pro team and roster slot values contain zero unknowns
- PASS - synthetic unknown position/slot/proTeam/stat/activity code flags
- provider_code_decoding detail: {"issues":[],"checkedProviders":["espn"],"observedCodeCounts":{"espn":{"proTeams":33,"positions":7,"activities":0,"lineupSlots":26,"scoringStats":50}}}
- synthetic unknown issues: [{"id":999,"kind":"activity","provider":"espn"},{"id":999,"kind":"lineup_slot","provider":"espn"},{"id":999,"kind":"position","provider":"espn"},{"id":999,"kind":"pro_team","provider":"espn"},{"id":999,"kind":"scoring_stat","provider":"espn"}]

## T16 real-league population

- Verified at: 2026-06-24T04:51:46.723Z
- DB target: default LOCAL_DATABASE_URL (postgres://rumbledore:rumbledore@localhost:5440/rumbledore)
- Provider identity: ESPN 95050, current season 2026
- Current shared provider row: NHS Alumni Annual (f8334edb-7a20-4138-aa7a-65c0b5285886)
- Task-note league id 466e2035-6c78-451a-b517-bcc5accae436: not present in this dev DB; provider 95050 resolved to current shared row above
- Current import rosters changed/total: 0/185
- Historical import rosters changed/total: 0/0
- Historical requested seasons: 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016, 2015, 2014, 2013, 2012, 2011
- Historical imported seasons this run: (none; existing checkpoint/data reused)
- Historical skipped seasons this run: 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016, 2015, 2014, 2013, 2012, 2011
- Stats recompute integrity failures: 0
- Baseline curation push: existing pushed seasons reused
- Canonical pushed seasons: 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026
- Confirmed eras: 12-team era (2013-2014) (2013, 2014)

### Counts

- Settings rows: 16
- fantasy_roster_entries: 24433 (3589 in 2012)
- fantasy_draft_picks: 2968
- Placeholder persons: 0
- Real name samples: bradwcummings, truman1109, w hardy
- Unknown player positions: 0
- Unknown player pro teams: 0
- Unknown roster slots: 0
- Integrity failures: 0
- Existing auth-plane members for the league: 0

### 2012 Week 8 Roster Decode Sample

| Player | Manager | Team | Pos | Pro | Slot | Started | Actual | Projected |
|---|---|---|---|---|---|---:|---:|---:|
| Luke Kuechly | MONROE_REBS | Team DOMTINATION | DL | CAR | LB | yes |  |  |

### Verification Checks

- PASS - placeholder persons are absent
- PASS - real manager names are present
- PASS - fantasy_roster_entries is populated
- PASS - decoded player positions/pro teams/roster slots have zero unknowns
- PASS - provider_code_decoding integrity passes
- PASS - record-book canonical snapshot has every imported season
- PASS - 2012 week 8 Luke Kuechly row is decoded
- provider_code_decoding detail: [{"detail":{"issues":[],"checkedProviders":["espn"],"observedCodeCounts":{"espn":{"proTeams":33,"positions":7,"activities":0,"lineupSlots":26,"scoringStats":50}}},"season":null,"status":"pass"}]

### Real-League Screenshot Proof

- Capture command: `T16_REAL_SCREENSHOTS=1 PATH=/usr/bin:$PATH pnpm exec playwright test e2e/real-95050-screenshots.spec.ts`
- Output root: `docs/screenshots/real-95050/`
- Viewports: `mobile`, `tablet`, `desktop`
- Captured pages per viewport:
  - `01-league-home.png`
  - `02-press-front.png`
  - `03-data-book-people.png`
  - `04-data-book-settings.png`
  - `05-data-book-weeks-roster-2012-wk8.png`
  - `06-edit-ledger.png`
  - `07-records.png`
- Screenshot file set: complete
- Screenshot verification:
  - Real names are visible: `bradwcummings`, `truman1109`, `w hardy`, `MONROE_REBS`.
  - `Fixture Manager` is absent.
  - Desktop People view shows real owner/source names and provider team mappings.
  - Desktop Weeks roster shows `W8 / MONROE_REBS` with Luke Kuechly decoded as `DL / CAR / active` in slot `LB`.
  - Records shows real standings/records, pushed seasons, and the `12-team era (2013-2014)` chip.
  - Screenshot run log duplicate-key grep: `0`.

## T19 player records

- Verified at: 2026-07-09T21:29:00.000Z
- Provider identity: ESPN 95050 (`NHS Alumni Annual`)
- Verification mode: read-only against the shared dev DB; no curation push or provider mutation performed.
- Live substrate rows present: `fantasy_players=761`, `fantasy_roster_entries=24433`, `fantasy_draft_picks=2968`.
- Existing pushed season snapshots: `16`.
- Existing pushed snapshots with T19 player arrays: `0` (all pushes predate the T19 snapshot extension).
- Pushed Record Book player samples from `getLeagueRecordsPageData`: best week `null`, QB/RB/WR bests `null`, bench tragedy `null`, draft steal `null`, draft bust `null`.

### T19 Checks

- PASS - real league resolves by provider id `95050`, not hardcoded internal UUID.
- PASS - live player-level substrate exists for the league.
- PASS - pushed Record Book does not quietly read live player tables when pushed snapshots lack player arrays.
- NOTE - sample player records will populate after a steward saves and pushes new season snapshots that include T19 player facts.
