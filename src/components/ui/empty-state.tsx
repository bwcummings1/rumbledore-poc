import { LockKeyhole } from "lucide-react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { cn } from "@/lib/utils";

interface EmptyStateProps
  extends Omit<ComponentPropsWithoutRef<"section">, "title"> {
  readonly action?: ReactNode;
  readonly children?: ReactNode;
  readonly icon?: ReactNode;
  readonly title: ReactNode;
  readonly variant?: "empty" | "gated";
}

function EmptyState({
  action,
  children,
  className,
  icon,
  role = "status",
  title,
  variant = "empty",
  ...props
}: EmptyStateProps) {
  return (
    <section
      className={cn(
        "cell grid justify-items-center gap-3 px-4 py-6 text-center",
        variant === "gated" &&
          "border-warning/50 bg-warning/10 shadow-[0_0_18px_var(--glow-amber),var(--bevel)]",
        className,
      )}
      data-slot="empty-state"
      data-variant={variant}
      role={role}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          "orb orb-md muted",
          variant === "gated" && "text-warning opacity-100",
        )}
        data-slot="empty-state-icon"
      >
        {icon ??
          (variant === "gated" ? <LockKeyhole className="size-4" /> : null)}
      </span>
      <div className="grid max-w-md gap-1">
        <h2 className="font-display text-base font-medium text-foreground">
          {title}
        </h2>
        {children ? (
          <div className="text-sm text-muted-foreground">{children}</div>
        ) : null}
      </div>
      {action ? (
        <div className="mt-1 w-full max-w-sm sm:w-auto max-sm:[&_a]:w-full max-sm:[&_button]:w-full">
          {action}
        </div>
      ) : null}
    </section>
  );
}

export { EmptyState };
export type { EmptyStateProps };
