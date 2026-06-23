# UI2 Handoff - League Data Navigation IA

## What Changed
- Collapsed the left-rail data IA from separate `Data Book` + `Edit Ledger` items into one `League Data` item.
  - `League Data` links to `/leagues/[leagueId]/data`.
  - `/leagues/[leagueId]/ledger` remains a direct route and highlights `League Data` in the shell.
  - `Records` remains its own left-rail destination.
- Added a shared `LeagueDataMasthead` that reuses `PublicationMasthead`/`TabLinks`.
  - Tabs: `Data Book` -> `/data`, `Edit Ledger` -> `/ledger`.
  - Data Book marks `Data Book` active; ledger marks `Edit Ledger` active.
- Moved Data Book grain selection out of the masthead.
  - `People / Settings / Weeks` is now a secondary `Segmented` selector inside the Data Book content.
  - The UI1 year picker, Save/Publish toolbar, collapsed `Curation details`, and editable tables are preserved.
- Kept `EditLedgerFeed` paginated and rendered under the shared League Data masthead.
- Updated `docs/DATA-FOUNDATION-DESIGN.md` §4.1 and `docs/PROGRESS.md` to reflect the corrected IA.
- Updated screenshot helper wait logic to use the enabled `Publish 2026` button, because the checkpoint message is inside collapsed curation details.

## Files Changed
- `src/navigation/scope.ts`
- `src/navigation/navigation-shell.tsx`
- `src/navigation/scope.test.ts`
- `src/navigation/navigation-shell.test.tsx`
- `src/app/leagues/[leagueId]/league-data-masthead.tsx`
- `src/app/leagues/[leagueId]/data/data-book-view.tsx`
- `src/app/leagues/[leagueId]/data/data-book-view.test.tsx`
- `src/app/leagues/[leagueId]/ledger/edit-ledger-view.tsx`
- `src/app/leagues/[leagueId]/ledger/edit-ledger-view.test.tsx`
- `e2e/screenshots.spec.ts`
- `docs/DATA-FOUNDATION-DESIGN.md`
- `docs/PROGRESS.md`
- `docs/screenshots/{mobile,tablet,desktop}/`

## Screenshots
Full harness:

```sh
script -q -e -c 'env SCREENSHOTS=1 PATH=/usr/bin:$PATH pnpm exec playwright test e2e/screenshots.spec.ts' /tmp/ui2-screenshots.log
```

Refreshed:
- `docs/screenshots/{mobile,tablet,desktop}/17-data-book.png`
- `docs/screenshots/{mobile,tablet,desktop}/18-edit-ledger.png`
- `docs/screenshots/{mobile,tablet,desktop}/18-edit-ledger-expanded.png`
- Full `docs/screenshots/{mobile,tablet,desktop}/` set was regenerated.

Duplicate-key checks:
- `grep -c 'same key' /tmp/ui2-screenshots.log` returned `0`.
- `grep -c 'Encountered two children' /tmp/ui2-screenshots.log` returned `0`.

Visual check:
- Desktop Data Book shows sidebar `League Data` + `Records`, shared `[Data Book | Edit Ledger]` tabs, and the Data Book grain selector inside content.
- Desktop Edit Ledger shows sidebar `League Data` active, shared masthead with `Edit Ledger` active, and the paginated ledger feed underneath.
- Mobile Data Book keeps the hierarchy readable with the grain selector below the League Data tabs.

## Verification
- Focused tests passed:
  - `PATH=/usr/bin:$PATH pnpm test src/navigation/scope.test.ts src/navigation/navigation-shell.test.tsx 'src/app/leagues/[leagueId]/data/data-book-view.test.tsx' 'src/app/leagues/[leagueId]/ledger/edit-ledger-view.test.tsx'`
- Final full gates passed:
  - `PATH=/usr/bin:$PATH pnpm typecheck`
  - `PATH=/usr/bin:$PATH pnpm lint`
  - `PATH=/usr/bin:$PATH pnpm test` -> 216 files passed, 1020 tests passed, 5 skipped.
  - `PATH=/usr/bin:$PATH pnpm build`
  - `PATH=/usr/bin:$PATH pnpm perf:pwa`
- UBS:
  - Ran against changed source/test/doc files, excluding binary PNG screenshots.
  - Exit 0; 0 critical issues.
- `PATH=/usr/bin:$PATH pnpm secret-scan` passed.

## Notes
- `/ledger` intentionally remains a route and league-switch target; it is only removed as a top-level shell item.
- The League Data shell active state maps `ledger` to the visible `data` nav item.
- Screenshot harness logs still include existing local test-environment warning noise (`NO_COLOR`/`FORCE_COLOR`, Better Auth test secret entropy, and an unrelated Members-route hydration warning), but the screenshot test passed and duplicate-key grep is clean.
