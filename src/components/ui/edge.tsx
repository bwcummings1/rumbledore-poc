import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { cn } from "@/lib/utils";

type EdgeTone = "negative" | "neutral" | "positive";

interface EdgeProps extends ComponentPropsWithoutRef<"span"> {
  readonly eyebrow?: ReactNode;
  readonly tone?: EdgeTone;
  readonly value: ReactNode;
}

const edgeToneClasses: Record<EdgeTone, string> = {
  negative: "border-destructive/50 bg-destructive/10 text-destructive",
  neutral: "border-input bg-[var(--panel)] text-muted-foreground",
  positive: "border-positive/50 bg-positive/10 text-positive",
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
        "inline-flex items-center gap-2 rounded-control border px-2.5 py-1 shadow-[var(--bevel)]",
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
      <span className="metric text-sm font-semibold">{value}</span>
    </span>
  );
}

export { Edge };
export type { EdgeProps, EdgeTone };
