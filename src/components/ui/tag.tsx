import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { cn } from "@/lib/utils";

interface TagProps extends ComponentPropsWithoutRef<"span"> {
  readonly children: ReactNode;
  readonly leadingIcon?: ReactNode;
}

function Tag({ children, className, leadingIcon, ...props }: TagProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-control border border-[var(--hair-2)] px-2 py-0.5 font-mono text-xs uppercase tracking-[0.08em] text-ink-3",
        className,
      )}
      data-slot="tag"
      {...props}
    >
      {leadingIcon ? (
        <span aria-hidden="true" className="[&_svg]:size-3">
          {leadingIcon}
        </span>
      ) : null}
      <span>{children}</span>
    </span>
  );
}

export { Tag };
export type { TagProps };
