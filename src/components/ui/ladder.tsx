import type { ComponentPropsWithoutRef } from "react";

import { cn } from "@/lib/utils";

interface LadderPip {
  readonly id: string;
  readonly isCurrent?: boolean;
  readonly label: string;
  readonly rank: number;
}

interface LadderProps extends ComponentPropsWithoutRef<"ol"> {
  readonly label: string;
  readonly pips: readonly LadderPip[];
}

function Ladder({ className, label, pips, ...props }: LadderProps) {
  return (
    <ol
      aria-label={label}
      className={cn("flex flex-col gap-2 sm:flex-row sm:items-end", className)}
      data-slot="ladder"
      {...props}
    >
      {pips.map((pip) => (
        <li
          aria-current={pip.isCurrent ? "true" : undefined}
          aria-label={`Rank ${pip.rank}: ${pip.label}${
            pip.isCurrent ? ", current league" : ""
          }`}
          className="min-w-0 flex-1"
          key={pip.id}
        >
          <span
            className={cn(
              "flex min-h-8 items-center gap-2 rounded-lg border border-[var(--hair-2)] bg-white/[0.04] px-2.5 font-mono text-xs text-ink-3",
              pip.isCurrent
                ? "border-primary/50 bg-primary/10 text-lilac-hi shadow-[0_0_12px_var(--glow-lilac)]"
                : "",
            )}
            data-current={pip.isCurrent ? "true" : undefined}
            data-slot="ladder-pip"
          >
            <span className="metric shrink-0">#{pip.rank}</span>
            <span className="truncate">{pip.label}</span>
            {pip.isCurrent ? (
              <span className="sr-only">current league</span>
            ) : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

export { Ladder };
export type { LadderPip, LadderProps };
