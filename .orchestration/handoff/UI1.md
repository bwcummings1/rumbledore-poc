# UI1 Handoff - Data Book / Edit Ledger Owner Polish

## What Changed
- Compact Data Book masthead:
  - removed the large masthead `controls` block from `/leagues/[leagueId]/data`
  - moved the season picker plus small Save/Publish actions to the `{season} {grain}` section toolbar
  - kept the season summary pills on that same row
- De-emphasized curation details:
  - saved/pushed state, restore checkpoint, season mode, push-all, and status/error alerts now live in a collapsed
    `Curation details` disclosure below the toolbar
  - all existing handlers and state transitions are preserved
- Paginated Edit Ledger:
  - `/api/leagues/[leagueId]/curation/ledger` accepts `limit` and `offset`
  - default page size is 25 and the response includes `pagination` metadata
  - `EditLedgerFeed` fetches pages on demand and keeps page controls inside the bordered ledger panel
- Record Book duplicate-key cleanup:
  - remaining label/name-derived keys in shared table/card rows and records summary/championship lists now include
    stable identity plus an index as final disambiguator

## Files Changed
- `src/app/leagues/[leagueId]/data/data-book-view.tsx`
- `src/app/leagues/[leagueId]/data/data-book-view.test.tsx`
- `src/app/api/leagues/[leagueId]/curation/ledger/route.ts`
- `src/app/api/leagues/[leagueId]/curation/ledger/route.test.ts`
- `src/app/leagues/[leagueId]/ledger/edit-ledger-data.ts`
- `src/app/leagues/[leagueId]/ledger/edit-ledger-view.tsx`
- `src/app/leagues/[leagueId]/ledger/edit-ledger-view.test.tsx`
- `src/components/curation/edit-ledger-feed.tsx`
- `src/components/curation/edit-ledger-feed.test.tsx`
- `src/stats/curation.ts`
- `src/stats/index.ts`
- `src/components/ui/table.tsx`
- `src/components/ui/data-card-table.tsx`
- `src/app/leagues/[leagueId]/league-home-view.tsx`
- `src/app/leagues/[leagueId]/records/league-records-view.tsx`
- `e2e/screenshots.spec.ts`

## Screenshots
Filtered harness command:

```sh
SCREENSHOTS=1 SCREENSHOT_FILTER='10-records,17-data-book,18-edit-ledger,18-edit-ledger-expanded' PATH=/usr/bin:$PATH pnpm exec playwright test e2e/screenshots.spec.ts
```

Refreshed:
- `docs/screenshots/{mobile,tablet,desktop}/10-records.png`
- `docs/screenshots/{mobile,tablet,desktop}/17-data-book.png`
- `docs/screenshots/{mobile,tablet,desktop}/18-edit-ledger.png`
- `docs/screenshots/{mobile,tablet,desktop}/18-edit-ledger-expanded.png`

Duplicate-key check:
- run log: `/tmp/ui1-screenshots.log`
- `grep -c 'same key' /tmp/ui1-screenshots.log` returned `0`

## Verification
- `PATH=/usr/bin:$PATH pnpm typecheck` passed.
- `PATH=/usr/bin:$PATH pnpm lint` passed.
- `PATH=/usr/bin:$PATH pnpm test` passed: 216 files passed, 1019 tests passed, 5 skipped.
- `PATH=/usr/bin:$PATH pnpm build` passed.
- `PATH=/usr/bin:$PATH pnpm perf:pwa` passed.
- `ubs <changed files>` exited 0.
- `PATH=/usr/bin:$PATH pnpm secret-scan` passed.

## Notes
- `listUnifiedDataLedger` still exists for compatibility and delegates to the paged implementation.
- Data Steward review still requests a bounded ledger preview and ignores pagination metadata.
- The screenshot spec now supports `SCREENSHOT_FILTER` so owner-review runs can refresh only requested PNGs.
