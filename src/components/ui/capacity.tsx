import type { ComponentPropsWithoutRef } from "react";

import { cn } from "@/lib/utils";

interface CapacityProps extends ComponentPropsWithoutRef<"div"> {
  readonly label: string;
  readonly total: number;
  readonly used: number;
}

function Capacity({ className, label, total, used, ...props }: CapacityProps) {
  const safeTotal = Math.max(total, 0);
  const safeUsed = clamp(used, 0, safeTotal);
  const ratio = safeTotal === 0 ? 0 : safeUsed / safeTotal;
  const toneClass =
    ratio >= 0.9
      ? "border-destructive/60 bg-destructive"
      : ratio >= 0.75
        ? "border-warning/60 bg-warning shadow-[0_0_7px_var(--glow-amber)]"
        : "border-primary/60 bg-primary shadow-[0_0_7px_var(--glow-lilac)]";

  return (
    <div
      className={cn("grid gap-1.5", className)}
      data-slot="capacity"
      {...props}
    >
      <meter
        aria-label={label}
        aria-valuetext={`${safeUsed} of ${safeTotal}`}
        className="sr-only"
        max={safeTotal}
        min={0}
        value={safeUsed}
      />
      <div className="flex items-center justify-between gap-3">
        <span className="eyebrow">{label}</span>
        <span className="metric text-xs text-muted-foreground">
          {safeUsed}/{safeTotal}
        </span>
      </div>
      <div className="grid grid-flow-col gap-1">
        {Array.from(
          { length: safeTotal },
          (_, index) => `capacity-${index}`,
        ).map((key, index) => (
          <span
            aria-hidden="true"
            className={cn(
              "h-3.5 rounded-sm border border-[var(--hair-2)] bg-white/[0.02] transition-[background-color,box-shadow]",
              index < safeUsed ? toneClass : "",
            )}
            data-slot="capacity-cell"
            key={key}
          />
        ))}
      </div>
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export { Capacity };
export type { CapacityProps };
