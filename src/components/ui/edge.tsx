import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { cn } from "@/lib/utils";

type EdgeTone = "negative" | "neutral" | "positive";

interface EdgeProps extends ComponentPropsWithoutRef<"span"> {
  readonly eyebrow?: ReactNode;
  readonly tone?: EdgeTone;
  readonly value: ReactNode;
}

const edgeToneClasses: Record<EdgeTone, string> = {
  negative: "border-destructive/40 bg-destructive/[0.06] text-coral",
  neutral: "border-[var(--hair-2)] text-ink-3",
  positive: "border-positive/40 bg-positive/[0.07] text-jade",
};

function Edge({
  className,
  eyebrow,
  tone = "neutral",
  value,
  ...props
}: EdgeProps) {
  const signal = tone === "positive" ? "+" : tone === "negative" ? "-" : "=";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-control border px-2 py-0.5",
        edgeToneClasses[tone],
        className,
      )}
      data-slot="edge"
      data-tone={tone}
      {...props}
    >
      {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
      <span aria-hidden="true" className="metric text-xs">
        {signal}
      </span>
      <span className="metric text-xs">{value}</span>
    </span>
  );
}

export { Edge };
export type { EdgeProps, EdgeTone };
