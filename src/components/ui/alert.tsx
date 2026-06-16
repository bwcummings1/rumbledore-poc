import { cva } from "class-variance-authority";
import { X } from "lucide-react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Button } from "./button";
import {
  type FeedbackTone,
  feedbackAriaLive,
  feedbackRole,
  feedbackToneIcons,
  normalizeFeedbackTone,
} from "./feedback-tones";

const alertVariants = cva(
  "grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 rounded-card border px-3 py-3 text-sm shadow-[var(--bevel)]",
  {
    variants: {
      tone: {
        danger:
          "border-destructive/50 bg-destructive/10 text-destructive shadow-[var(--bevel)]",
        info: "border-primary/50 bg-primary/10 text-foreground shadow-[0_0_18px_var(--glow-lilac),var(--bevel)]",
        ok: "border-positive/50 bg-positive/10 text-foreground",
        warn: "border-warning/50 bg-warning/10 text-foreground shadow-[0_0_18px_var(--glow-amber),var(--bevel)]",
      },
    },
    defaultVariants: {
      tone: "info",
    },
  },
);

interface AlertProps extends Omit<ComponentPropsWithoutRef<"div">, "title"> {
  readonly actions?: ReactNode;
  readonly children?: ReactNode;
  readonly dismissLabel?: string;
  readonly icon?: ReactNode;
  readonly onDismiss?: () => void;
  readonly title?: ReactNode;
  readonly tone?: FeedbackTone;
}

function Alert({
  actions,
  children,
  className,
  dismissLabel = "Dismiss alert",
  icon,
  onDismiss,
  role,
  title,
  tone = "info",
  ...props
}: AlertProps) {
  const normalizedTone = normalizeFeedbackTone(tone);
  const Icon = feedbackToneIcons[normalizedTone];

  return (
    <div
      aria-live={props["aria-live"] ?? feedbackAriaLive(tone)}
      className={cn(alertVariants({ className, tone: normalizedTone }))}
      data-slot="alert"
      data-tone={normalizedTone}
      role={role ?? feedbackRole(tone)}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          "mt-0.5 flex size-5 items-center justify-center",
          normalizedTone === "danger" && "text-destructive",
          normalizedTone === "info" && "text-primary",
          normalizedTone === "ok" && "text-positive",
          normalizedTone === "warn" && "text-warning",
        )}
        data-slot="alert-icon"
      >
        {icon ?? <Icon className="size-5" />}
      </span>
      <div className="min-w-0 border-l border-current/35 pl-3">
        {title ? (
          <p className="font-display text-sm font-semibold text-foreground">
            {title}
          </p>
        ) : null}
        {children ? (
          <div className={cn("text-muted-foreground", title && "mt-1")}>
            {children}
          </div>
        ) : null}
        {actions ? (
          <div className="mt-3 flex flex-wrap gap-2 max-sm:grid max-sm:grid-cols-1">
            {actions}
          </div>
        ) : null}
      </div>
      {onDismiss ? (
        <Button
          aria-label={dismissLabel}
          className="-m-1"
          onClick={onDismiss}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <X />
        </Button>
      ) : null}
    </div>
  );
}

export { Alert, alertVariants };
export type { AlertProps };
