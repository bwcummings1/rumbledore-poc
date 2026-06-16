import type { ComponentPropsWithoutRef } from "react";

import { cn } from "@/lib/utils";

interface BadgeProps extends ComponentPropsWithoutRef<"output"> {
  readonly label?: string;
  readonly max?: number;
  readonly value?: number | string;
  readonly variant?: "dot" | "number";
}

function Badge({
  className,
  label,
  max = 99,
  value,
  variant = "number",
  ...props
}: BadgeProps) {
  const display = formatBadgeValue(value, max);
  const ariaLabel =
    label ?? (variant === "dot" ? "Has activity" : `${display} items`);

  return (
    <output
      aria-label={ariaLabel}
      className={cn(
        "inline-flex items-center justify-center rounded-full bg-primary font-mono font-bold text-primary-foreground shadow-[0_0_14px_var(--glow-lilac),var(--bevel)]",
        variant === "dot" ? "size-2.5" : "min-h-5 min-w-5 px-1 text-xs",
        className,
      )}
      data-slot="badge"
      data-variant={variant}
      {...props}
    >
      {variant === "dot" ? null : display}
    </output>
  );
}

function formatBadgeValue(value: BadgeProps["value"], max: number): string {
  if (typeof value === "number") {
    return value > max ? `${max}+` : String(value);
  }

  return value ?? "";
}

export { Badge, formatBadgeValue };
export type { BadgeProps };
