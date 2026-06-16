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
        "inline-flex min-h-7 items-center gap-1.5 rounded-full border border-input bg-[var(--panel)] px-2.5 text-xs font-medium text-muted-foreground shadow-[var(--bevel)]",
        className,
      )}
      data-slot="tag"
      {...props}
    >
      {leadingIcon ? (
        <span aria-hidden="true" className="[&_svg]:size-3.5">
          {leadingIcon}
        </span>
      ) : null}
      <span>{children}</span>
    </span>
  );
}

export { Tag };
export type { TagProps };
