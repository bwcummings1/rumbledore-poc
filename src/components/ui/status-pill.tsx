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
  "inline-flex min-h-6 items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap shadow-[var(--bevel)]",
  {
    variants: {
      tone: {
        danger: "border-destructive/50 bg-destructive/10 text-destructive",
        info: "border-primary/50 bg-primary/10 text-primary",
        live: "border-primary/50 bg-primary/10 text-primary shadow-[0_0_14px_var(--glow-lilac),var(--bevel)]",
        neutral: "border-input bg-[var(--panel)] text-muted-foreground",
        success: "border-positive/50 bg-positive/10 text-positive",
        warning: "border-warning/50 bg-warning/10 text-warning",
      },
      variant: {
        outline: "bg-transparent",
        soft: "",
        solid: "bg-current text-primary-foreground",
      },
    },
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
