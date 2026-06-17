"use client";

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import Link from "next/link";
import type { ComponentProps, KeyboardEvent, ReactNode } from "react";

import { cn } from "@/lib/utils";

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

interface TabLinkItem {
  readonly active?: boolean;
  readonly badge?: ReactNode;
  readonly disabled?: boolean;
  readonly href: string;
  readonly icon?: ReactNode;
  readonly label: ReactNode;
  readonly prefetch?: boolean;
}

interface TabLinksProps {
  readonly ariaLabel: string;
  readonly className?: string;
  readonly items: readonly TabLinkItem[];
}

const tabClassName =
  "group/tab relative -mb-px inline-flex shrink-0 snap-start items-center justify-center gap-2 rounded-none border-b-2 border-transparent px-4 py-2.5 font-display text-sm font-medium tracking-[0.05em] text-ink-3 outline-none transition-[border-color,color] hover:text-ink-2 focus-visible:shadow-[var(--focus-ring-shadow)] data-[active=true]:border-primary data-[active=true]:text-lilac data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50";

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

function TabLinks({ ariaLabel, className, items }: TabLinksProps) {
  return (
    <nav
      aria-label={`${ariaLabel} navigation`}
      className={cn("min-w-0", className)}
      data-slot="tab-links"
    >
      <div
        aria-label={ariaLabel}
        className="relative flex min-w-0 snap-x gap-1 overflow-x-auto border-b border-border pb-px"
        onKeyDown={handleTabLinkKeyDown}
        role="tablist"
      >
        {items.map((item) => (
          <Link
            aria-current={item.active ? "page" : undefined}
            aria-disabled={item.disabled ? true : undefined}
            aria-selected={Boolean(item.active)}
            className={tabClassName}
            data-active={item.active ? "true" : "false"}
            data-disabled={item.disabled ? "true" : undefined}
            data-slot="tab-link"
            href={item.href}
            key={item.href}
            prefetch={item.prefetch}
            role="tab"
            tabIndex={item.active ? 0 : -1}
          >
            {item.icon ? (
              <span className="shrink-0 [&_svg:not([class*='size-'])]:size-4">
                {item.icon}
              </span>
            ) : null}
            <span className="truncate">{item.label}</span>
            {item.badge ? <span className="shrink-0">{item.badge}</span> : null}
          </Link>
        ))}
      </div>
    </nav>
  );
}

function handleTabLinkKeyDown(event: KeyboardEvent<HTMLDivElement>) {
  const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
  if (!keys.includes(event.key)) {
    return;
  }

  const tabs = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>(
      '[role="tab"]:not([aria-disabled="true"])',
    ),
  );
  if (tabs.length === 0) {
    return;
  }

  const focusedIndex =
    document.activeElement instanceof HTMLElement
      ? tabs.indexOf(document.activeElement)
      : -1;
  const currentIndex = Math.max(
    focusedIndex,
    tabs.findIndex((tab) => tab.getAttribute("aria-selected") === "true"),
    0,
  );
  const lastIndex = tabs.length - 1;
  const nextIndex =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? lastIndex
        : event.key === "ArrowRight"
          ? currentIndex === lastIndex
            ? 0
            : currentIndex + 1
          : currentIndex === 0
            ? lastIndex
            : currentIndex - 1;

  event.preventDefault();
  tabs[nextIndex]?.focus();
}

export { TabLinks, Tabs };
export type { TabItem, TabLinkItem, TabLinksProps, TabsProps };
