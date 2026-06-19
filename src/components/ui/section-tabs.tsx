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

interface SectionTabsBaseItem {
  readonly badge?: ReactNode;
  readonly description?: string;
  readonly disabled?: boolean;
  readonly label: ReactNode;
  readonly value: string;
}

export interface SectionTabLinkItem extends SectionTabsBaseItem {
  readonly active?: boolean;
  readonly href: string;
}

export interface SectionTabPanelItem extends SectionTabsBaseItem {
  readonly panel: ReactNode;
}

interface SectionTabsBaseProps {
  readonly ariaLabel: string;
  readonly className?: string;
  readonly deck?: string;
  readonly eyebrow?: string;
  readonly title: string;
}

interface SectionTabLinksProps extends SectionTabsBaseProps {
  readonly items: readonly SectionTabLinkItem[];
  readonly mode: "links";
}

interface SectionTabPanelsProps extends SectionTabsBaseProps {
  readonly defaultValue?: string;
  readonly items: readonly SectionTabPanelItem[];
  readonly mode: "panels";
}

export type SectionTabsProps = SectionTabLinksProps | SectionTabPanelsProps;

const sectionTabClassName =
  "group/section-tab inline-flex min-h-11 shrink-0 snap-start items-center justify-center gap-2 rounded-full border border-[var(--hair-2)] bg-[var(--panel)] px-3 py-2 text-center font-mono text-xs uppercase tracking-[0.08em] text-ink-3 shadow-[var(--bevel)] outline-none transition-[background-color,border-color,box-shadow,color,transform] hover:-translate-y-0.5 hover:border-[var(--hair-3)] hover:text-ink-2 focus-visible:shadow-[var(--focus-ring-shadow),var(--bevel)] motion-reduce:transition-none motion-reduce:hover:translate-y-0 data-[active=true]:border-primary/55 data-[active=true]:bg-primary/15 data-[active=true]:text-lilac-hi data-[active=true]:shadow-[0_0_18px_var(--glow-lilac),var(--bevel)] data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50";

export function SectionTabs(props: SectionTabsProps) {
  if (props.mode === "links") {
    return <SectionTabLinks {...props} />;
  }

  return <SectionTabPanels {...props} />;
}

function SectionTabLinks({
  ariaLabel,
  className,
  deck,
  eyebrow = "section nav",
  items,
  title,
}: SectionTabLinksProps) {
  const activeItem =
    items.find((item) => item.active) ??
    items.find((item) => !item.disabled) ??
    items[0];

  return (
    <section
      aria-label={ariaLabel}
      className={cn("panel grid gap-4 p-4 sm:p-5", className)}
      data-slot="section-tabs"
    >
      <SectionTabsHeader
        deck={activeItem?.description ?? deck}
        eyebrow={eyebrow}
        title={title}
      />
      <nav aria-label={`${ariaLabel} navigation`} className="min-w-0">
        <div
          aria-label={ariaLabel}
          className="flex min-w-0 snap-x gap-2 overflow-x-auto pb-1"
          onKeyDown={handleSectionTabKeyDown}
          role="tablist"
        >
          {items.map((item) => {
            const active = Boolean(item.active);
            return (
              <Link
                aria-current={active ? "page" : undefined}
                aria-disabled={item.disabled ? true : undefined}
                aria-selected={active}
                className={sectionTabClassName}
                data-active={active ? "true" : "false"}
                data-disabled={item.disabled ? "true" : undefined}
                href={item.href}
                key={item.value}
                role="tab"
                tabIndex={active ? 0 : -1}
              >
                <span className="truncate">{item.label}</span>
                {item.badge ? (
                  <span className="shrink-0 text-ink-2">{item.badge}</span>
                ) : null}
              </Link>
            );
          })}
        </div>
      </nav>
    </section>
  );
}

function SectionTabPanels({
  ariaLabel,
  className,
  deck,
  defaultValue,
  eyebrow = "section nav",
  items,
  title,
}: SectionTabPanelsProps) {
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

  return (
    <section className="grid gap-6" data-slot="section-tabs">
      <div className={cn("panel grid gap-4 p-4 sm:p-5", className)}>
        <SectionTabsHeader
          deck={activeItem?.description ?? deck}
          eyebrow={eyebrow}
          title={title}
        />
        <nav aria-label={`${ariaLabel} navigation`} className="min-w-0">
          <div
            aria-label={ariaLabel}
            className="flex min-w-0 snap-x gap-2 overflow-x-auto pb-1"
            onKeyDown={handleSectionTabKeyDown}
            role="tablist"
          >
            {items.map((item) => {
              const active = item.value === activeItem?.value;
              return (
                <button
                  aria-controls={`${idPrefix}-${item.value}-panel`}
                  aria-disabled={item.disabled ? true : undefined}
                  aria-selected={active}
                  className={sectionTabClassName}
                  data-active={active ? "true" : "false"}
                  data-disabled={item.disabled ? "true" : undefined}
                  data-section-tab-value={item.value}
                  disabled={item.disabled}
                  id={`${idPrefix}-${item.value}-tab`}
                  key={item.value}
                  onClick={() => setActiveValue(item.value)}
                  role="tab"
                  tabIndex={active ? 0 : -1}
                  type="button"
                >
                  <span className="truncate">{item.label}</span>
                  {item.badge ? (
                    <span className="shrink-0 text-ink-2">{item.badge}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </nav>
      </div>
      {activeItem ? (
        <section
          aria-labelledby={`${idPrefix}-${activeItem.value}-tab`}
          className="outline-none focus-visible:shadow-[var(--focus-ring-shadow)]"
          id={`${idPrefix}-${activeItem.value}-panel`}
          role="tabpanel"
        >
          {activeItem.panel}
        </section>
      ) : null}
    </section>
  );
}

function SectionTabsHeader({
  deck,
  eyebrow,
  title,
}: {
  readonly deck?: string;
  readonly eyebrow: string;
  readonly title: string;
}) {
  return (
    <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,32rem)] lg:items-end">
      <div className="min-w-0">
        <p className="eyebrow text-primary">{eyebrow}</p>
        <h2 className="heading-auspex mt-2 text-lg leading-tight">{title}</h2>
      </div>
      {deck ? (
        <p className="max-w-[60ch] text-sm leading-6 text-ink-2 lg:text-right">
          {deck}
        </p>
      ) : null}
    </div>
  );
}

function handleSectionTabKeyDown(event: KeyboardEvent<HTMLDivElement>) {
  if (
    event.key !== "ArrowLeft" &&
    event.key !== "ArrowRight" &&
    event.key !== "Home" &&
    event.key !== "End"
  ) {
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
