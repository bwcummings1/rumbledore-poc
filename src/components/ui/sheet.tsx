"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import {
  type ComponentProps,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  useState,
} from "react";

import { cn } from "@/lib/utils";
import { Alert } from "./alert";

const sheetPanelVariants = cva(
  "panel fixed z-50 grid max-h-dvh grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden shadow-overlay outline-none max-sm:inset-x-0 max-sm:bottom-0 max-sm:max-h-[88dvh] max-sm:w-full max-sm:rounded-b-none max-sm:rounded-t-sheet max-sm:border-x-0 max-sm:border-b-0 max-sm:data-[snap=half]:max-h-[56dvh] sm:top-0 sm:h-dvh sm:w-[min(26rem,calc(100vw-var(--space-8)))] sm:rounded-none",
  {
    variants: {
      side: {
        left: "sm:left-0 sm:border-y-0 sm:border-l-0",
        right: "sm:right-0 sm:border-y-0 sm:border-r-0",
      },
    },
    defaultVariants: {
      side: "right",
    },
  },
);

type SheetRootProps = Omit<
  ComponentProps<typeof DialogPrimitive.Root>,
  "children"
>;

interface SheetProps
  extends SheetRootProps,
    VariantProps<typeof sheetPanelVariants> {
  readonly children: ReactNode;
  readonly closeLabel?: string;
  readonly description?: ReactNode;
  readonly empty?: ReactNode;
  readonly error?: ReactNode;
  readonly footer?: ReactNode;
  readonly loading?: boolean;
  readonly title: ReactNode;
  readonly trigger?: ReactElement;
}

function Sheet({
  children,
  closeLabel = "Close sheet",
  description,
  disablePointerDismissal,
  empty,
  error,
  footer,
  loading = false,
  side,
  title,
  trigger,
  ...rootProps
}: SheetProps) {
  const [snap, setSnap] = useState<"full" | "half">("half");

  return (
    <DialogPrimitive.Root
      disablePointerDismissal={disablePointerDismissal}
      {...rootProps}
    >
      {trigger ? <DialogPrimitive.Trigger render={trigger} /> : null}
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          className="fixed inset-0 z-40 bg-background/70 backdrop-blur-sm motion-reduce:backdrop-blur-none"
          data-slot="sheet-backdrop"
        />
        <DialogPrimitive.Popup
          aria-modal={true}
          aria-busy={loading ? true : undefined}
          className={cn(sheetPanelVariants({ side }))}
          data-slot="sheet"
          data-snap={snap}
          initialFocus={true}
        >
          <header className="sticky top-0 z-10 grid gap-3 border-b border-border bg-[var(--panel-solid)]/95 px-4 py-3">
            <button
              aria-label={`Resize ${textFromNode(title) ?? "sheet"}`}
              className="mx-auto h-6 w-16 rounded-full text-muted-foreground outline-none focus-visible:shadow-[var(--focus-ring-shadow)] sm:hidden"
              data-slot="sheet-grabber"
              onKeyDown={(event) => handleGrabberKeyDown(event, setSnap)}
              type="button"
            >
              <span className="mx-auto block h-1 w-10 rounded-full bg-muted-foreground/50" />
            </button>
            <div className="flex items-start justify-between gap-3">
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
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-control text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground focus-visible:shadow-[var(--focus-ring-shadow)] focus-visible:outline-none"
              >
                <X className="size-4" />
              </DialogPrimitive.Close>
            </div>
          </header>
          <div className="grid min-h-0 gap-3 overflow-y-auto px-4 py-4">
            {error ? <Alert tone="danger">{error}</Alert> : null}
            {empty ?? children}
          </div>
          {footer ? (
            <footer className="sticky bottom-0 z-10 grid gap-2 border-t border-border bg-[var(--panel-solid)]/95 px-4 py-3 pb-[calc(var(--space-3)+env(safe-area-inset-bottom))] sm:flex sm:flex-wrap sm:justify-end">
              {footer}
            </footer>
          ) : null}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function handleGrabberKeyDown(
  event: KeyboardEvent<HTMLButtonElement>,
  setSnap: (snap: "full" | "half") => void,
) {
  if (event.key === "ArrowUp") {
    event.preventDefault();
    setSnap("full");
  }
  if (event.key === "ArrowDown") {
    event.preventDefault();
    setSnap("half");
  }
}

function textFromNode(node: ReactNode): string | undefined {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  return undefined;
}

export { Sheet, sheetPanelVariants };
export type { SheetProps };
