# Ingestion property tests

`current-league.property.test.ts` exercises all six Spec 47 §C ingestion invariants against generated normalized
season bundles. CI uses fixed seeds with three runs per ordinary DB property and one season-scale volume run; the
volume generator's smallest case still exceeds PostgreSQL's 65,535 bind-parameter ceiling when inserts are unchunked.

For a deeper local or scheduled run, point the suite at an isolated test database and raise `PROPERTY_RUNS`:

```bash
PATH=/usr/bin:$PATH DATABASE_URL="$ISOLATED_TEST_DATABASE_URL" PROPERTY_RUNS=25 \
  pnpm exec vitest run src/testing/arbitraries.test.ts src/ingestion/current-league.property.test.ts
```

Never point property runs at the shared owner-data database. Fast-check reports the deterministic seed and shrunk
counterexample on failure, so a failed case can be replayed without increasing the run count.
