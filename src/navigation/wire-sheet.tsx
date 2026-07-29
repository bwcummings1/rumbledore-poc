"use client";

import type { ReactNode } from "react";
import { Sheet } from "@/components/ui/sheet";

/**
 * Split out of `navigation-shell.tsx` so `next/dynamic` has a module boundary
 * to load on demand: the expanded Wire only exists after the mobile wire strip
 * is tapped.
 *
 * The expanded ticker is passed as `children` rather than imported here on
 * purpose. `ShellWireTicker` also renders the always-visible wire strip at the
 * top of the shell, so it has to stay in the main chunk; importing it from this
 * module would either duplicate it into the lazy chunk or, worse, pull this
 * module back through a cycle. Taking it as `children` keeps the lazy boundary
 * to exactly what is lazy: `Sheet` and `@base-ui/react/dialog`.
 */
export function WireSheet({
  children,
  onOpenChange,
  open,
}: {
  readonly children: ReactNode;
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
}) {
  return (
    <Sheet
      closeLabel="Close The Wire"
      description="General NFL and fantasy headlines, or the same wire filtered to your rostered players."
      onOpenChange={onOpenChange}
      open={open}
      title="The Wire"
    >
      {children}
    </Sheet>
  );
}
