Old-league oracle fixture for stats and record-book tests.

This is a minimal, scrubbed subset of the legacy JSON outputs consumed by the
current oracle tests:

- `ffl-matchups/processed_matchups_*.json`
- `ffl-playoffs/processed_playoff_matchups_*.json`
- `ffl-totals/team_stats_*.json`

Owner handles were replaced consistently with `Old Manager NN`; team names were
replaced with matching `Old Team NN` values. Numeric scores, standings ranks,
records, seasons, scoring periods, and multi-week period keys are unchanged.
