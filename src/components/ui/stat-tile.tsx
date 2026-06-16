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
      className={cn("cell grid gap-2 p-4", className)}
      data-slot="stat-tile"
      {...props}
    >
      <legend className="eyebrow min-w-0">{label}</legend>
      <div className="flex items-start justify-end gap-3">
        {delta ? (
          <span className="metric shrink-0 text-xs text-muted-foreground">
            {delta}
          </span>
        ) : null}
      </div>
      <div className={cn("text-2xl font-bold", valueToneClasses[tone])}>
        {value}
      </div>
      {caption ? (
        <p className="text-sm text-muted-foreground">{caption}</p>
      ) : null}
      {sparkline ? (
        <div data-slot="stat-tile-sparkline">{sparkline}</div>
      ) : null}
    </fieldset>
  );
}

export { StatTile };
export type { StatTileProps, StatTileTone };
