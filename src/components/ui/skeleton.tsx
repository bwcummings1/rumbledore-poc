import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentPropsWithoutRef } from "react";

import { cn } from "@/lib/utils";

const skeletonVariants = cva(
  "relative overflow-hidden bg-muted-foreground/15 before:absolute before:inset-0 before:-translate-x-full before:bg-[linear-gradient(90deg,transparent,var(--glow-lilac),transparent)] motion-safe:before:animate-pulse motion-reduce:before:hidden",
  {
    variants: {
      variant: {
        block: "rounded-control",
        card: "rounded-card border border-border bg-card shadow-[var(--bevel)]",
        circle: "rounded-full",
        line: "rounded-control",
        "stat-tile": "min-h-24 rounded-card border border-border bg-card p-4",
        "story-card": "min-h-40 rounded-card border border-border bg-card p-4",
        "table-row": "h-12 rounded-control",
      },
    },
    defaultVariants: {
      variant: "block",
    },
  },
);

interface SkeletonProps
  extends ComponentPropsWithoutRef<"div">,
    VariantProps<typeof skeletonVariants> {}

function Skeleton({ className, variant, ...props }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(skeletonVariants({ className, variant }))}
      data-slot="skeleton"
      data-variant={variant ?? "block"}
      {...props}
    />
  );
}

export { Skeleton, skeletonVariants };
export type { SkeletonProps };
