"use client";

import { Toast as ToastPrimitive } from "@base-ui/react/toast";
import { X } from "lucide-react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { cn } from "@/lib/utils";
import {
  type FeedbackTone,
  feedbackToneIcons,
  normalizeFeedbackTone,
} from "./feedback-tones";

interface ToastAction {
  readonly label: ReactNode;
  readonly onClick?: () => void;
}

interface ToastOptions {
  readonly action?: ToastAction;
  readonly description?: ReactNode;
  readonly id?: string;
  readonly timeout?: number;
  readonly title: ReactNode;
  readonly tone?: FeedbackTone;
}

interface UseToastReturn {
  readonly close: (id?: string) => void;
  readonly notify: (options: ToastOptions) => string;
}

type ToastData = {
  readonly tone: FeedbackTone;
};

function useToast(): UseToastReturn {
  const manager = ToastPrimitive.useToastManager<ToastData>();

  return {
    close: manager.close,
    notify(options) {
      const tone = options.tone ?? "info";
      const normalizedTone = normalizeFeedbackTone(tone);
      return manager.add({
        actionProps: options.action
          ? {
              children: options.action.label,
              onClick: options.action.onClick,
            }
          : undefined,
        data: { tone },
        description: options.description,
        id: options.id,
        priority:
          normalizedTone === "danger" || normalizedTone === "warn"
            ? "high"
            : "low",
        timeout:
          normalizedTone === "danger" ? 0 : (options.timeout ?? undefined),
        title: options.title,
        type: normalizedTone,
      });
    },
  };
}

function ToastViewport({
  className,
  ...props
}: ComponentPropsWithoutRef<"div">) {
  const manager = ToastPrimitive.useToastManager<ToastData>();

  return (
    <ToastPrimitive.Portal>
      <ToastPrimitive.Viewport
        aria-label="Notifications"
        className={cn(
          "fixed right-3 bottom-[calc(var(--space-4)+env(safe-area-inset-bottom))] z-50 grid w-[min(24rem,calc(100vw-var(--space-6)))] gap-2 outline-none md:right-4 md:bottom-4 max-md:left-1/2 max-md:-translate-x-1/2",
          className,
        )}
        data-slot="toast-viewport"
        {...props}
      >
        {manager.toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} />
        ))}
      </ToastPrimitive.Viewport>
    </ToastPrimitive.Portal>
  );
}

function ToastCard({
  toast,
}: {
  readonly toast: ToastPrimitive.Root.ToastObject<ToastData>;
}) {
  const tone = normalizeFeedbackTone(toast.data?.tone ?? "info");
  const Icon = feedbackToneIcons[tone];
  const isAssertive = tone === "danger" || tone === "warn";

  return (
    <ToastPrimitive.Root
      aria-live={isAssertive ? "assertive" : "polite"}
      className={cn(
        "panel grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 rounded-card p-3 text-sm shadow-overlay",
        tone === "danger" && "border-destructive/50 bg-destructive/10",
        tone === "info" && "border-primary/50 bg-primary/10",
        tone === "ok" && "border-positive/50 bg-positive/10",
        tone === "warn" && "border-warning/50 bg-warning/10",
      )}
      data-slot="toast"
      data-tone={tone}
      role={isAssertive ? "alert" : "status"}
      swipeDirection={["down", "right"]}
      toast={toast}
    >
      <Icon
        aria-hidden="true"
        className={cn(
          "mt-0.5 size-5",
          tone === "danger" && "text-destructive",
          tone === "info" && "text-primary",
          tone === "ok" && "text-positive",
          tone === "warn" && "text-warning",
        )}
      />
      <ToastPrimitive.Content className="min-w-0">
        <ToastPrimitive.Title className="font-display text-sm font-semibold text-foreground">
          {toast.title}
        </ToastPrimitive.Title>
        {toast.description ? (
          <ToastPrimitive.Description className="mt-1 text-sm text-muted-foreground">
            {toast.description}
          </ToastPrimitive.Description>
        ) : null}
        {toast.actionProps ? (
          <ToastPrimitive.Action
            {...toast.actionProps}
            className={cn(
              "mt-3 inline-flex min-h-10 items-center rounded-control border border-input px-3 text-sm font-medium text-foreground hover:bg-primary/10 focus-visible:shadow-[var(--focus-ring-shadow)] focus-visible:outline-none",
              toast.actionProps.className,
            )}
          />
        ) : null}
      </ToastPrimitive.Content>
      <ToastPrimitive.Close
        aria-label="Dismiss notification"
        className="inline-flex size-10 items-center justify-center rounded-control text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground focus-visible:shadow-[var(--focus-ring-shadow)] focus-visible:outline-none"
      >
        <X className="size-4" />
      </ToastPrimitive.Close>
    </ToastPrimitive.Root>
  );
}

export { ToastViewport, useToast };
export type { ToastOptions, UseToastReturn };
