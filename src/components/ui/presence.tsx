import type { ComponentPropsWithoutRef } from "react";

import { cn } from "@/lib/utils";

type PresenceStatus = "idle" | "live" | "offline" | "online";

interface PresenceProps extends ComponentPropsWithoutRef<"output"> {
  readonly label?: string;
  readonly status: PresenceStatus;
  readonly withText?: boolean;
}

const statusClasses: Record<PresenceStatus, string> = {
  idle: "bg-warning",
  live: "bg-primary shadow-[0_0_14px_var(--glow-lilac)] motion-safe:animate-pulse motion-reduce:animate-none",
  offline: "bg-muted-foreground",
  online: "bg-positive",
};

const defaultLabels: Record<PresenceStatus, string> = {
  idle: "idle",
  live: "live",
  offline: "offline",
  online: "online",
};

function Presence({
  className,
  label,
  status,
  withText = false,
  ...props
}: PresenceProps) {
  const resolvedLabel = label ?? defaultLabels[status];

  return (
    <output
      aria-label={resolvedLabel}
      className={cn("inline-flex items-center gap-1.5", className)}
      data-slot="presence"
      data-status={status}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          "inline-flex size-2.5 shrink-0 rounded-full ring-2 ring-background",
          statusClasses[status],
        )}
        data-slot="presence-dot"
      />
      {withText ? (
        <span className="text-xs font-medium text-muted-foreground">
          {resolvedLabel}
        </span>
      ) : (
        <span className="sr-only">{resolvedLabel}</span>
      )}
    </output>
  );
}

export { Presence };
export type { PresenceProps, PresenceStatus };
