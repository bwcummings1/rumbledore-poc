"use client";

import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import type { ComponentProps, ReactElement, ReactNode } from "react";

import { cn } from "@/lib/utils";

type TooltipRootProps = Omit<
  ComponentProps<typeof TooltipPrimitive.Root>,
  "children"
>;

interface TooltipProps extends TooltipRootProps {
  readonly children: ReactNode;
  readonly delay?: number;
  readonly side?: ComponentProps<typeof TooltipPrimitive.Positioner>["side"];
  readonly trigger: ReactElement;
}

function Tooltip({
  children,
  delay = 300,
  side = "top",
  trigger,
  ...rootProps
}: TooltipProps) {
  return (
    <TooltipPrimitive.Provider delay={delay}>
      <TooltipPrimitive.Root {...rootProps}>
        <TooltipPrimitive.Trigger delay={delay} render={trigger} />
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Positioner
            className="z-50"
            side={side}
            sideOffset={8}
          >
            <TooltipPrimitive.Popup
              className={cn(
                "panel max-w-64 rounded-control px-2.5 py-1.5 font-mono text-xs tracking-[0.04em] text-ink-2 shadow-overlay outline-none motion-reduce:transition-none",
              )}
              data-slot="tooltip"
              role="tooltip"
            >
              {children}
              <TooltipPrimitive.Arrow className="fill-[var(--panel-solid)] text-border" />
            </TooltipPrimitive.Popup>
          </TooltipPrimitive.Positioner>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}

export { Tooltip };
export type { TooltipProps };
