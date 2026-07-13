# ESPN vocabulary evidence

These files are an evidence corpus, not a serialization of Rumbledore's production dictionaries. They were
independently transcribed from training knowledge of the mature `cwendt94/espn-api` and
`mkreiser/ESPN-Fantasy-Football-API` clients, cross-checked against a local cwendt94 0.38.1 source snapshot and the
committed sanitized ESPN payload fixtures. `reference-data.ts` was deliberately excluded from the transcription
phase; it is only the system under test in `vocabulary-closure.test.ts`.

The numeric corpora establish code closure. Source vocabulary is preserved directly where it differs from
Rumbledore's internal representation: scoring entries carry ESPN abbreviations and labels rather than production
semantic keys, and the three contextual normalizations (`22` blank slot to `N/A`, lineup slot `23` to `FLEX`, and
pro-team `0` from `None` to `FA`) name both the source value and the reason.

The committed real-payload corpus currently contains one sanitized league shape. Consequently this vocabulary is
training-knowledge-derived and fixture-cross-checked, but remains pending validation against approved multi-league
real-payload harvests. Unknown production-only codes belong in `dictionary-exceptions.json` as `{code, reason}`;
empty reasons are rejected by the closure test.
