import { X } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly leadingIcon?: ReactNode;
  readonly onRemove?: () => void;
  readonly removableLabel?: string;
  readonly selected?: boolean;
}

function Chip({
  children,
  className,
  leadingIcon,
  onRemove,
  removableLabel = "Remove",
  selected = false,
  type = "button",
  ...props
}: ChipProps) {
  return (
    <span className="inline-flex min-h-11 items-center" data-slot="chip-shell">
      <button
        aria-pressed={props["aria-pressed"] ?? selected}
        className={cn(
          "inline-flex min-h-9 items-center gap-2 rounded-full border border-input bg-[var(--panel)] px-3 text-sm font-medium text-muted-foreground shadow-[var(--bevel)] outline-none transition-[background-color,border-color,box-shadow,color] hover:border-[var(--hair-3)] hover:text-foreground focus-visible:border-primary focus-visible:shadow-[var(--focus-ring-shadow),var(--bevel)] disabled:pointer-events-none disabled:opacity-50",
          selected
            ? "border-primary bg-primary/15 text-foreground shadow-[0_0_18px_var(--glow-lilac),var(--bevel)]"
            : "",
          onRemove ? "rounded-r-control pr-2" : "",
          className,
        )}
        data-slot="chip"
        type={type}
        {...props}
      >
        {leadingIcon ? (
          <span className="shrink-0 [&_svg:not([class*='size-'])]:size-4">
            {leadingIcon}
          </span>
        ) : null}
        <span className="truncate">{children}</span>
      </button>
      {onRemove ? (
        <button
          aria-label={removableLabel}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-input bg-[var(--panel)] text-muted-foreground shadow-[var(--bevel)] outline-none transition-[background-color,color] hover:bg-primary/10 hover:text-foreground focus-visible:border-primary focus-visible:shadow-[var(--focus-ring-shadow),var(--bevel)]"
          onClick={onRemove}
          type="button"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      ) : null}
    </span>
  );
}

export { Chip };
export type { ChipProps };
