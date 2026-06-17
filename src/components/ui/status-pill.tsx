import { cva, type VariantProps } from "class-variance-authority";
import { Circle, Radio } from "lucide-react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { cn } from "@/lib/utils";

type StatusTone =
  | "danger"
  | "info"
  | "live"
  | "neutral"
  | "success"
  | "warning";

const statusPillVariants = cva(
  "inline-flex items-center gap-1.5 rounded-control border border-current px-2 py-0.5 font-mono text-xs font-medium uppercase leading-none tracking-[0.1em] whitespace-nowrap",
  {
    variants: {
      tone: {
        danger: "text-coral",
        info: "text-lilac",
        live: "text-lilac shadow-[0_0_14px_var(--glow-lilac)]",
        neutral: "text-ink-3",
        success: "text-jade",
        warning: "text-amber",
      },
      variant: {
        outline: "bg-transparent",
        soft: "",
        solid: "border-transparent text-primary-foreground",
      },
    },
    compoundVariants: [
      { variant: "solid", tone: "danger", className: "bg-coral" },
      { variant: "solid", tone: "info", className: "bg-lilac" },
      { variant: "solid", tone: "live", className: "bg-lilac" },
      { variant: "solid", tone: "neutral", className: "bg-ink-3" },
      { variant: "solid", tone: "success", className: "bg-jade" },
      { variant: "solid", tone: "warning", className: "bg-amber" },
    ],
    defaultVariants: {
      tone: "neutral",
      variant: "soft",
    },
  },
);

interface StatusPillProps
  extends ComponentPropsWithoutRef<"span">,
    VariantProps<typeof statusPillVariants> {
  readonly children: ReactNode;
  readonly icon?: ReactNode;
  readonly showDot?: boolean;
}

function StatusPill({
  children,
  className,
  icon,
  showDot = true,
  tone,
  variant,
  ...props
}: StatusPillProps) {
  const resolvedTone = tone ?? "neutral";

  return (
    <span
      className={cn(statusPillVariants({ className, tone, variant }))}
      data-slot="status-pill"
      data-tone={resolvedTone}
      {...props}
    >
      {icon ? (
        <span aria-hidden="true" className="[&_svg]:size-3">
          {icon}
        </span>
      ) : showDot ? (
        resolvedTone === "live" ? (
          <Radio
            aria-hidden="true"
            className="size-3 motion-safe:animate-pulse motion-reduce:animate-none"
          />
        ) : (
          <Circle aria-hidden="true" className="size-2 fill-current" />
        )
      ) : null}
      <span>{children}</span>
    </span>
  );
}

export { StatusPill, statusPillVariants };
export type { StatusPillProps, StatusTone };
