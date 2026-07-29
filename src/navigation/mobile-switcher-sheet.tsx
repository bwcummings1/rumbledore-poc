"use client";

import { Sheet } from "@/components/ui/sheet";
import type { LeagueSwitcherViewItem } from "./league-switcher-model";
import { LeagueSwitcherView } from "./league-switcher-view";
import type { ActiveNavigationState } from "./scope";

/**
 * Split out of `navigation-shell.tsx` so `next/dynamic` has a module boundary
 * to load on demand. Nothing here renders until the mobile scope trigger is
 * tapped, but statically imported it put `Sheet` (and through it
 * `@base-ui/react/dialog`) plus the whole `LeagueSwitcherView` into every
 * route's initial JS.
 */
export function MobileSwitcherSheet({
  activeState,
  items,
  onClose,
  presenceByLeagueId,
}: {
  readonly activeState: ActiveNavigationState;
  readonly items: readonly LeagueSwitcherViewItem[];
  readonly onClose: () => void;
  readonly presenceByLeagueId: Readonly<Record<string, number>>;
}) {
  return (
    <Sheet
      closeLabel="Close scope switcher"
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open={true}
      title={
        <span className="grid gap-1">
          <span className="eyebrow">Scope</span>
          <span>Switch environments</span>
        </span>
      }
    >
      <LeagueSwitcherView
        activeState={activeState}
        className="border-0 bg-transparent p-0 shadow-none"
        items={items}
        presenceByLeagueId={presenceByLeagueId}
        showHeader={false}
      />
    </Sheet>
  );
}
