import type { ComponentPropsWithoutRef } from "react";

import { cn } from "@/lib/utils";

interface ProgressProps extends ComponentPropsWithoutRef<"div"> {
  readonly label: string;
  readonly max?: number;
  readonly min?: number;
  readonly showValue?: boolean;
  readonly tone?: "amber" | "lilac";
  readonly value?: number;
}

function Progress({
  className,
  label,
  max = 100,
  min = 0,
  showValue = false,
  tone = "lilac",
  value,
  ...props
}: ProgressProps) {
  const isIndeterminate = typeof value !== "number";
  const percent = isIndeterminate
    ? 33
    : clamp(((value - min) / (max - min)) * 100, 0, 100);
  const labelValue = isIndeterminate ? undefined : `${Math.round(percent)}%`;

  return (
    <div
      className={cn("grid gap-1.5", className)}
      data-slot="progress"
      {...props}
    >
      {showValue ? (
        <div className="flex items-center justify-between gap-3">
          <span className="eyebrow">{label}</span>
          <span className="metric text-xs text-muted-foreground">
            {labelValue}
          </span>
        </div>
      ) : null}
      <div
        aria-label={label}
        aria-valuemax={isIndeterminate ? undefined : max}
        aria-valuemin={isIndeterminate ? undefined : min}
        aria-valuenow={isIndeterminate ? undefined : value}
        className="h-1.5 overflow-hidden rounded-full bg-white/[0.05]"
        role="progressbar"
      >
        <span
          className={cn(
            "block h-full rounded-full",
            tone === "amber"
              ? "bg-warning shadow-[0_0_8px_var(--glow-amber)]"
              : "bg-primary shadow-[0_0_8px_var(--glow-lilac)]",
            isIndeterminate
              ? "motion-safe:animate-pulse motion-reduce:animate-none"
              : "",
          )}
          data-slot="progress-fill"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export { Progress };
export type { ProgressProps };
