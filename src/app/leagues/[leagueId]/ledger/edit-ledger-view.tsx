import { EditLedgerFeed } from "@/components/curation/edit-ledger-feed";
import { LeagueDataMasthead } from "../league-data-masthead";
import type { EditLedgerPageData } from "./edit-ledger-data";

export function EditLedgerView({
  data,
}: {
  readonly data: EditLedgerPageData;
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-6 px-4 py-5 pb-[calc(--spacing(6)+env(safe-area-inset-bottom))] sm:px-6">
      <LeagueDataMasthead
        activeTab="edit-ledger"
        league={data.league}
        sectionLabel={`${data.pagination.total} entries`}
      />

      <section
        aria-label="Chronological curation activity"
        className="grid gap-3"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="eyebrow text-primary">Change log</p>
            <h2 className="heading-auspex text-lg leading-tight">
              Latest first
            </h2>
          </div>
          <p className="max-w-xl text-sm text-muted-foreground">
            Click any row to inspect the before and after values. Saves and
            pushes show the covered seasons and checkpoint markers.
          </p>
        </div>
        <EditLedgerFeed
          entries={data.entries}
          initialPagination={data.pagination}
          leagueId={data.league.id}
        />
      </section>
    </main>
  );
}
