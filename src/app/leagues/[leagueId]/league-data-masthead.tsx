import { ArrowLeft, BookOpen, Database, ScrollText } from "lucide-react";
import {
  PublicationMasthead,
  type PublicationNavItem,
} from "@/components/publication/front-view";

type LeagueDataTab = "data-book" | "edit-ledger";

interface LeagueDataMastheadLeague {
  readonly id: string;
  readonly name: string;
  readonly provider: string;
  readonly providerLeagueId: string;
}

interface LeagueDataMastheadProps {
  readonly activeTab: LeagueDataTab;
  readonly league: LeagueDataMastheadLeague;
  readonly sectionLabel?: string;
}

function leagueDataNavItems({
  activeTab,
  leagueId,
}: {
  activeTab: LeagueDataTab;
  leagueId: string;
}): PublicationNavItem[] {
  return [
    {
      active: activeTab === "data-book",
      href: `/leagues/${leagueId}/data`,
      icon: <Database aria-hidden="true" className="size-4" />,
      label: "Data Book",
    },
    {
      active: activeTab === "edit-ledger",
      href: `/leagues/${leagueId}/ledger`,
      icon: <ScrollText aria-hidden="true" className="size-4" />,
      label: "Edit Ledger",
    },
  ];
}

export function LeagueDataMasthead({
  activeTab,
  league,
  sectionLabel,
}: LeagueDataMastheadProps) {
  return (
    <PublicationMasthead
      actions={[
        {
          href: `/leagues/${league.id}`,
          icon: <ArrowLeft data-icon="inline-start" />,
          label: "League home",
        },
        {
          href: `/leagues/${league.id}/records`,
          icon: <BookOpen data-icon="inline-start" />,
          label: "Records",
        },
      ]}
      deck={`${league.provider.toUpperCase()} ${league.providerLeagueId}. Curated source tables and the league-visible audit trail for edits, saves, and pushed season snapshots.`}
      eyebrow="LEAGUE DATA"
      navAriaLabel="League Data sections"
      navItems={leagueDataNavItems({ activeTab, leagueId: league.id })}
      sectionLabel={sectionLabel}
      title={`${league.name} League Data`}
    />
  );
}
