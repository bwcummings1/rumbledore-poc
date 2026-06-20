"use client";

import Link from "next/link";
import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";

import { cn } from "@/lib/utils";
import { tabClassName } from "./tab-styles";

interface TabBaseItem {
  readonly active?: boolean;
  readonly badge?: ReactNode;
  readonly disabled?: boolean;
  readonly icon?: ReactNode;
  readonly label: ReactNode;
}

interface TabLinkItem extends TabBaseItem {
  readonly href: string;
  readonly prefetch?: boolean;
}

interface TabButtonItem extends TabBaseItem {
  readonly controlsId?: string;
  readonly id?: string;
  readonly onSelect: () => void;
  readonly value: string;
}

interface TabPanelLinkItem extends Omit<TabBaseItem, "active"> {
  readonly panel: ReactNode;
  readonly value: string;
}

interface TabLinksProps {
  readonly ariaLabel: string;
  readonly className?: string;
  readonly items: readonly (TabButtonItem | TabLinkItem)[];
}

interface TabLinksPanelGroupProps {
  readonly ariaLabel: string;
  readonly className?: string;
  readonly defaultValue?: string;
  readonly header: ReactNode;
  readonly headerClassName?: string;
  readonly items: readonly TabPanelLinkItem[];
  readonly panelClassName?: string;
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
        {items.map((item) => {
          const content = (
            <>
              {item.icon ? (
                <span className="shrink-0 [&_svg:not([class*='size-'])]:size-4">
                  {item.icon}
                </span>
              ) : null}
              <span className="truncate">{item.label}</span>
              {item.badge ? (
                <span className="shrink-0">{item.badge}</span>
              ) : null}
            </>
          );

          if ("href" in item) {
            return (
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
                {content}
              </Link>
            );
          }

          return (
            <button
              aria-controls={item.controlsId}
              aria-disabled={item.disabled ? true : undefined}
              aria-selected={Boolean(item.active)}
              className={tabClassName}
              data-active={item.active ? "true" : "false"}
              data-disabled={item.disabled ? "true" : undefined}
              data-slot="tab-link"
              disabled={item.disabled}
              id={item.id}
              key={item.value}
              onClick={item.onSelect}
              role="tab"
              tabIndex={item.active ? 0 : -1}
              type="button"
            >
              {content}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function TabLinksPanelGroup({
  ariaLabel,
  className,
  defaultValue,
  header,
  headerClassName,
  items,
  panelClassName,
}: TabLinksPanelGroupProps) {
  const idPrefix = useId();
  const fallbackValue = useMemo(
    () =>
      defaultValue ??
      items.find((item) => !item.disabled)?.value ??
      items[0]?.value ??
      "",
    [defaultValue, items],
  );
  const [activeValue, setActiveValue] = useState(fallbackValue);

  useEffect(() => {
    setActiveValue(fallbackValue);
  }, [fallbackValue]);

  const activeItem =
    items.find((item) => item.value === activeValue && !item.disabled) ??
    items.find((item) => !item.disabled) ??
    items[0];
  const tabItems: readonly TabButtonItem[] = items.map((item) => {
    const active = item.value === activeItem?.value;
    return {
      active,
      badge: item.badge,
      controlsId: `${idPrefix}-${item.value}-panel`,
      disabled: item.disabled,
      icon: item.icon,
      id: `${idPrefix}-${item.value}-tab`,
      label: item.label,
      onSelect: () => setActiveValue(item.value),
      value: item.value,
    };
  });

  return (
    <section
      className={cn("grid gap-6", className)}
      data-slot="tab-links-panel-group"
    >
      <header className={cn("panel grid gap-5 p-4 sm:p-5", headerClassName)}>
        {header}
        <TabLinks ariaLabel={ariaLabel} items={tabItems} />
      </header>
      {activeItem ? (
        <section
          aria-labelledby={`${idPrefix}-${activeItem.value}-tab`}
          className={cn(
            "outline-none focus-visible:shadow-[var(--focus-ring-shadow)]",
            panelClassName,
          )}
          id={`${idPrefix}-${activeItem.value}-panel`}
          role="tabpanel"
        >
          {activeItem.panel}
        </section>
      ) : null}
    </section>
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
  const nextTab = tabs[nextIndex];
  nextTab?.focus();

  if (nextTab instanceof HTMLButtonElement) {
    nextTab.click();
  }
}

export { TabLinks, TabLinksPanelGroup };
export type {
  TabButtonItem,
  TabLinkItem,
  TabLinksPanelGroupProps,
  TabLinksProps,
  TabPanelLinkItem,
};
