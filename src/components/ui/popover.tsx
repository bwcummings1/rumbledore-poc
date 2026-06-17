"use client";

import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { X } from "lucide-react";
import type { ComponentProps, ReactElement, ReactNode } from "react";

import { cn } from "@/lib/utils";

type PopoverRootProps = Omit<
  ComponentProps<typeof PopoverPrimitive.Root>,
  "children"
>;

interface PopoverProps extends PopoverRootProps {
  readonly children: ReactNode;
  readonly description?: ReactNode;
  readonly side?: ComponentProps<typeof PopoverPrimitive.Positioner>["side"];
  readonly title?: ReactNode;
  readonly trigger: ReactElement;
}

function Popover({
  children,
  description,
  side = "bottom",
  title,
  trigger,
  ...rootProps
}: PopoverProps) {
  return (
    <PopoverPrimitive.Root {...rootProps}>
      <PopoverPrimitive.Trigger render={trigger} />
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner
          className="z-50"
          collisionPadding={12}
          side={side}
          sideOffset={8}
        >
          <PopoverPrimitive.Popup
            className={cn(
              "panel grid max-h-[min(70dvh,24rem)] w-[min(22rem,calc(100vw-var(--space-6)))] gap-3 overflow-y-auto p-3 shadow-overlay outline-none max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:max-h-[80dvh] max-sm:w-full max-sm:rounded-b-none max-sm:rounded-t-sheet max-sm:border-x-0 max-sm:border-b-0",
            )}
            data-slot="popover"
            initialFocus={true}
            role="dialog"
          >
            {title ? (
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <PopoverPrimitive.Title className="font-display text-sm font-semibold text-foreground">
                    {title}
                  </PopoverPrimitive.Title>
                  {description ? (
                    <PopoverPrimitive.Description className="mt-1 text-sm text-muted-foreground">
                      {description}
                    </PopoverPrimitive.Description>
                  ) : null}
                </div>
                <PopoverPrimitive.Close
                  aria-label="Close popover"
                  className="inline-flex size-9 shrink-0 items-center justify-center rounded-control text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground focus-visible:shadow-[var(--focus-ring-shadow)] focus-visible:outline-none"
                >
                  <X className="size-4" />
                </PopoverPrimitive.Close>
              </div>
            ) : null}
            {children}
            <PopoverPrimitive.Arrow className="fill-[var(--panel-solid)] text-border max-sm:hidden" />
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

export { Popover };
export type { PopoverProps };
