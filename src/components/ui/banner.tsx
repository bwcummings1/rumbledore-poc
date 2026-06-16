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

const bannerVariants = cva(
  "panel flex w-full items-start gap-3 rounded-card px-3 py-3 text-sm sm:items-center",
  {
    variants: {
      tone: {
        danger:
          "border-destructive/50 bg-destructive/10 text-foreground shadow-[var(--bevel)]",
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

interface BannerProps extends Omit<ComponentPropsWithoutRef<"div">, "title"> {
  readonly action?: ReactNode;
  readonly children?: ReactNode;
  readonly dismissLabel?: string;
  readonly onDismiss?: () => void;
  readonly title?: ReactNode;
  readonly tone?: FeedbackTone;
}

function Banner({
  action,
  children,
  className,
  dismissLabel = "Dismiss banner",
  onDismiss,
  role,
  title,
  tone = "info",
  ...props
}: BannerProps) {
  const normalizedTone = normalizeFeedbackTone(tone);
  const Icon = feedbackToneIcons[normalizedTone];

  return (
    <div
      aria-live={props["aria-live"] ?? feedbackAriaLive(tone)}
      className={cn(bannerVariants({ className, tone: normalizedTone }))}
      data-slot="banner"
      data-tone={normalizedTone}
      role={role ?? feedbackRole(tone)}
      {...props}
    >
      <Icon
        aria-hidden="true"
        className={cn(
          "mt-0.5 size-5 shrink-0 sm:mt-0",
          normalizedTone === "danger" && "text-destructive",
          normalizedTone === "info" && "text-primary",
          normalizedTone === "ok" && "text-positive",
          normalizedTone === "warn" && "text-warning",
        )}
      />
      <div className="min-w-0 flex-1">
        {title ? (
          <p className="font-display text-sm font-semibold text-foreground">
            {title}
          </p>
        ) : null}
        {children ? (
          <div className={cn("text-muted-foreground", title && "mt-0.5")}>
            {children}
          </div>
        ) : null}
      </div>
      {action ? (
        <div className="shrink-0 max-sm:w-full max-sm:[&_a]:w-full max-sm:[&_button]:w-full">
          {action}
        </div>
      ) : null}
      {onDismiss ? (
        <Button
          aria-label={dismissLabel}
          className="-m-1 shrink-0"
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

export { Banner, bannerVariants };
export type { BannerProps };
