import { LockKeyhole } from "lucide-react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { cn } from "@/lib/utils";

interface LockedFeatureCardProps
  extends Omit<ComponentPropsWithoutRef<"section">, "title"> {
  readonly action?: ReactNode;
  readonly body: ReactNode;
  readonly preview?: ReactNode;
  readonly reason?: ReactNode;
  readonly title: ReactNode;
}

function LockedFeatureCard({
  action,
  body,
  className,
  preview,
  reason,
  title,
  ...props
}: LockedFeatureCardProps) {
  return (
    <section
      className={cn(
        "panel relative grid gap-4 overflow-hidden border-warning/50 p-4 shadow-[0_0_24px_-8px_var(--glow-amber),var(--bevel)]",
        className,
      )}
      data-slot="locked-feature-card"
      {...props}
    >
      {preview ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-25 blur-[1px] saturate-50"
          data-slot="locked-feature-preview"
        >
          {preview}
        </div>
      ) : null}
      <div className="relative z-10 flex items-start gap-3">
        <span
          aria-hidden="true"
          className="orb orb-md muted grid shrink-0 place-items-center text-warning"
        >
          <LockKeyhole className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          {reason ? <p className="eyebrow text-warning">{reason}</p> : null}
          <h2 className="font-display text-base font-semibold text-foreground">
            {title}
          </h2>
          <div className="mt-2 text-sm leading-6 text-muted-foreground">
            {body}
          </div>
        </div>
      </div>
      {action ? (
        <div className="relative z-10 w-full max-sm:[&_a]:w-full max-sm:[&_button]:w-full sm:w-fit">
          {action}
        </div>
      ) : null}
    </section>
  );
}

export { LockedFeatureCard };
export type { LockedFeatureCardProps };
