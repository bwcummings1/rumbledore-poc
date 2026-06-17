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
    <span className="inline-flex items-center" data-slot="chip-shell">
      <button
        aria-pressed={props["aria-pressed"] ?? selected}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-[var(--hair-2)] px-3 py-1.5 font-mono text-xs uppercase tracking-[0.06em] text-ink-3 outline-none transition-[background-color,border-color,box-shadow,color] hover:border-[var(--hair-3)] hover:text-ink-2 focus-visible:border-primary focus-visible:shadow-[var(--focus-ring-shadow)] disabled:pointer-events-none disabled:opacity-50",
          selected ? "border-primary/50 bg-primary/10 text-lilac-hi" : "",
          onRemove ? "rounded-r-none pr-2.5" : "",
          className,
        )}
        data-slot="chip"
        type={type}
        {...props}
      >
        {leadingIcon ? (
          <span className="shrink-0 [&_svg:not([class*='size-'])]:size-3.5">
            {leadingIcon}
          </span>
        ) : null}
        <span className="truncate">{children}</span>
      </button>
      {onRemove ? (
        <button
          aria-label={removableLabel}
          className="inline-flex size-7 items-center justify-center rounded-full rounded-l-none border border-l-0 border-[var(--hair-2)] text-ink-3 outline-none transition-[background-color,color] hover:bg-primary/10 hover:text-coral focus-visible:border-primary focus-visible:shadow-[var(--focus-ring-shadow)] [&_svg]:size-3"
          onClick={onRemove}
          type="button"
        >
          <X aria-hidden="true" className="size-3" />
        </button>
      ) : null}
    </span>
  );
}

export { Chip };
export type { ChipProps };
