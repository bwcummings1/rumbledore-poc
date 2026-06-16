"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import type { ComponentProps, ReactElement, ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Alert } from "./alert";

const dialogPanelVariants = cva(
  "panel fixed z-50 grid max-h-[min(85dvh,42rem)] w-[calc(100vw-var(--space-6))] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden shadow-overlay outline-none sm:left-1/2 sm:top-1/2 sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 max-sm:inset-x-0 max-sm:bottom-0 max-sm:max-h-[88dvh] max-sm:w-full max-sm:rounded-b-none max-sm:rounded-t-sheet max-sm:border-x-0 max-sm:border-b-0",
  {
    variants: {
      size: {
        lg: "sm:max-w-3xl",
        md: "sm:max-w-lg",
        sm: "sm:max-w-md",
      },
    },
    defaultVariants: {
      size: "md",
    },
  },
);

type DialogRootProps = Omit<
  ComponentProps<typeof DialogPrimitive.Root>,
  "children"
>;

interface DialogProps
  extends DialogRootProps,
    VariantProps<typeof dialogPanelVariants> {
  readonly children: ReactNode;
  readonly closeLabel?: string;
  readonly description?: ReactNode;
  readonly error?: ReactNode;
  readonly footer?: ReactNode;
  readonly loading?: boolean;
  readonly title: ReactNode;
  readonly trigger?: ReactElement;
}

function Dialog({
  children,
  closeLabel = "Close dialog",
  description,
  disablePointerDismissal,
  error,
  footer,
  loading = false,
  size,
  title,
  trigger,
  ...rootProps
}: DialogProps) {
  return (
    <DialogPrimitive.Root
      disablePointerDismissal={disablePointerDismissal}
      {...rootProps}
    >
      {trigger ? <DialogPrimitive.Trigger render={trigger} /> : null}
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          className="fixed inset-0 z-40 bg-background/70 backdrop-blur-sm motion-reduce:backdrop-blur-none"
          data-slot="dialog-backdrop"
        />
        <DialogPrimitive.Popup
          aria-modal={true}
          aria-busy={loading ? true : undefined}
          className={cn(dialogPanelVariants({ size }))}
          data-slot="dialog"
          initialFocus={true}
        >
          <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-[var(--panel-solid)]/95 px-4 py-3">
            <div className="min-w-0">
              <DialogPrimitive.Title className="font-display text-base font-semibold text-foreground">
                {title}
              </DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground">
                  {description}
                </DialogPrimitive.Description>
              ) : null}
            </div>
            <DialogPrimitive.Close
              aria-label={closeLabel}
              className={cn(
                "inline-flex size-10 shrink-0 items-center justify-center rounded-control text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground focus-visible:shadow-[var(--focus-ring-shadow)] focus-visible:outline-none",
              )}
            >
              <X className="size-4" />
            </DialogPrimitive.Close>
          </header>
          <div className="grid min-h-0 gap-3 overflow-y-auto px-4 py-4">
            {error ? <Alert tone="danger">{error}</Alert> : null}
            {children}
          </div>
          {footer ? (
            <footer className="sticky bottom-0 z-10 flex flex-wrap justify-end gap-2 border-t border-border bg-[var(--panel-solid)]/95 px-4 py-3 max-sm:grid max-sm:grid-cols-1">
              {loading ? (
                <span className="mr-auto inline-flex min-h-10 items-center gap-2 text-sm text-muted-foreground">
                  <span aria-hidden="true" className="orb orb-xs think" />
                  Working
                </span>
              ) : null}
              {footer}
            </footer>
          ) : null}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export { Dialog, dialogPanelVariants };
export type { DialogProps };
