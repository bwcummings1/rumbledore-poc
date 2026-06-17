import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { cn } from "@/lib/utils";

type StatTileTone = "amber" | "default" | "lilac";

interface StatTileProps extends ComponentPropsWithoutRef<"fieldset"> {
  readonly caption?: ReactNode;
  readonly delta?: ReactNode;
  readonly label: ReactNode;
  readonly sparkline?: ReactNode;
  readonly tone?: StatTileTone;
  readonly value: ReactNode;
}

const valueToneClasses: Record<StatTileTone, string> = {
  amber: "lcd",
  default: "metric text-foreground",
  lilac: "lcd lcd-live",
};

function StatTile({
  caption,
  className,
  delta,
  label,
  sparkline,
  tone = "default",
  value,
  ...props
}: StatTileProps) {
  return (
    <fieldset
      className={cn("cell grid gap-1.5 p-4", className)}
      data-slot="stat-tile"
      {...props}
    >
      <legend className="eyebrow min-w-0">{label}</legend>
      <div className="flex items-end justify-between gap-3">
        <div className={cn("text-2xl leading-none", valueToneClasses[tone])}>
          {value}
        </div>
        {delta ? (
          <span className="metric shrink-0 text-xs text-ink-3">{delta}</span>
        ) : null}
      </div>
      {caption ? (
        <p className="text-xs text-ink-3">{caption}</p>
      ) : null}
      {sparkline ? (
        <div data-slot="stat-tile-sparkline">{sparkline}</div>
      ) : null}
    </fieldset>
  );
}

export { StatTile };
export type { StatTileProps, StatTileTone };
