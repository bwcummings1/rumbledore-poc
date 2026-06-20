"use client";

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { tabClassName } from "./tab-styles";

interface TabItem {
  readonly disabled?: boolean;
  readonly label: ReactNode;
  readonly panel: ReactNode;
  readonly value: string;
}

interface TabsProps
  extends Omit<ComponentProps<typeof TabsPrimitive.Root>, "children"> {
  readonly items: readonly TabItem[];
  readonly listLabel?: string;
}

function Tabs({ className, items, listLabel = "Tabs", ...props }: TabsProps) {
  return (
    <TabsPrimitive.Root
      className={cn("grid gap-3", className)}
      data-slot="tabs"
      {...props}
    >
      <TabsPrimitive.List
        activateOnFocus={true}
        aria-label={listLabel}
        className="relative flex min-w-0 snap-x gap-1 overflow-x-auto border-b border-border motion-reduce:scroll-auto"
        data-slot="tabs-list"
      >
        {items.map((item) => (
          <TabsPrimitive.Tab
            className={tabClassName}
            data-slot="tabs-tab"
            disabled={item.disabled}
            key={item.value}
            value={item.value}
          >
            {item.label}
          </TabsPrimitive.Tab>
        ))}
      </TabsPrimitive.List>
      {items.map((item) => (
        <TabsPrimitive.Panel
          className="outline-none focus-visible:shadow-[var(--focus-ring-shadow)]"
          data-slot="tabs-panel"
          key={item.value}
          tabIndex={-1}
          value={item.value}
        >
          {item.panel}
        </TabsPrimitive.Panel>
      ))}
    </TabsPrimitive.Root>
  );
}

export { Tabs };
export type { TabItem, TabsProps };
