import { ArrowLeft, BookOpen, Database, ScrollText } from "lucide-react";
import { EditLedgerFeed } from "@/components/curation/edit-ledger-feed";
import {
  PublicationMasthead,
  type PublicationNavItem,
} from "@/components/publication/front-view";
import type { EditLedgerPageData } from "./edit-ledger-data";

function dataNavItems(leagueId: string): PublicationNavItem[] {
  return [
    {
      href: `/leagues/${leagueId}/data`,
      icon: <Database aria-hidden="true" className="size-4" />,
      label: "Data Book",
    },
    {
      active: true,
      href: `/leagues/${leagueId}/ledger`,
      icon: <ScrollText aria-hidden="true" className="size-4" />,
      label: "Edit Ledger",
    },
    {
      href: `/leagues/${leagueId}/records`,
      icon: <BookOpen aria-hidden="true" className="size-4" />,
      label: "Records",
    },
  ];
}

export function EditLedgerView({
  data,
}: {
  readonly data: EditLedgerPageData;
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-6 px-4 py-5 pb-[calc(--spacing(6)+env(safe-area-inset-bottom))] sm:px-6">
      <PublicationMasthead
        actions={[
          {
            href: `/leagues/${data.league.id}`,
            icon: <ArrowLeft data-icon="inline-start" />,
            label: "League home",
          },
          {
            href: `/leagues/${data.league.id}/data`,
            icon: <Database data-icon="inline-start" />,
            label: "Data Book",
          },
        ]}
        deck={`${data.league.provider.toUpperCase()} ${data.league.providerLeagueId}. Read-only curation history for edits, saves, and pushed season snapshots.`}
        eyebrow="EDIT LEDGER"
        navAriaLabel="Data layer destinations"
        navItems={dataNavItems(data.league.id)}
        sectionLabel={`${data.pagination.total} entries`}
        title={`${data.league.name} Edit Ledger`}
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
