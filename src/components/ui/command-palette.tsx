"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Search, X } from "lucide-react";
import {
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";

import { cn } from "@/lib/utils";
import { Alert } from "./alert";
import { Button } from "./button";
import { EmptyState } from "./empty-state";
import { Input } from "./input";
import { Skeleton } from "./skeleton";

interface CommandPaletteItem {
  readonly description?: ReactNode;
  readonly disabled?: boolean;
  readonly group: string;
  readonly href?: string;
  readonly icon?: ReactNode;
  readonly id: string;
  readonly keywords?: readonly string[];
  readonly label: ReactNode;
  readonly onSelect?: (item: CommandPaletteItem) => void;
  readonly shortcut?: string;
}

interface CommandPaletteProps {
  readonly defaultOpen?: boolean;
  readonly emptyAction?: CommandPaletteItem;
  readonly error?: ReactNode;
  readonly hotkey?: boolean;
  readonly items: readonly CommandPaletteItem[];
  readonly loading?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly onSelect?: (item: CommandPaletteItem) => void;
  readonly open?: boolean;
  readonly placeholder?: string;
  readonly trigger?: ReactElement;
}

interface CommandPaletteGroup {
  readonly items: readonly CommandPaletteItem[];
  readonly label: string;
}

function CommandPalette({
  defaultOpen = false,
  emptyAction,
  error,
  hotkey = true,
  items,
  loading = false,
  onOpenChange,
  onSelect,
  open,
  placeholder = "Search leagues, sections, actions",
  trigger,
}: CommandPaletteProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const listboxId = useId();
  const isOpen = open ?? internalOpen;
  const filteredGroups = useMemo(
    () => filterCommandItems(items, query),
    [items, query],
  );
  const visibleItems = filteredGroups.flatMap((group) => group.items);
  const activeItem = visibleItems[activeIndex] ?? null;
  const activeOptionId = activeItem
    ? `${listboxId}-${activeItem.id}`
    : undefined;

  function setOpen(nextOpen: boolean) {
    if (open === undefined) {
      setInternalOpen(nextOpen);
    }
    onOpenChange?.(nextOpen);
    setActiveIndex(0);
  }

  useEffect(() => {
    if (!hotkey) {
      return;
    }

    function handleDocumentKeyDown(event: globalThis.KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
    }

    window.addEventListener("keydown", handleDocumentKeyDown);
    return () => window.removeEventListener("keydown", handleDocumentKeyDown);
  });

  function runItem(item: CommandPaletteItem) {
    if (item.disabled) {
      return;
    }

    item.onSelect?.(item);
    onSelect?.(item);
    setOpen(false);
    setQuery("");

    if (item.href && !item.onSelect && !onSelect) {
      window.location.assign(item.href);
    }
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) =>
        visibleItems.length === 0 ? 0 : (index + 1) % visibleItems.length,
      );
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) =>
        visibleItems.length === 0
          ? 0
          : index === 0
            ? visibleItems.length - 1
            : index - 1,
      );
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(Math.max(visibleItems.length - 1, 0));
      return;
    }
    if (event.key === "Enter" && activeItem) {
      event.preventDefault();
      runItem(activeItem);
      return;
    }
    if (event.key === "Escape" && query.length === 0) {
      setOpen(false);
    }
  }

  return (
    <DialogPrimitive.Root onOpenChange={setOpen} open={isOpen}>
      {trigger ? <DialogPrimitive.Trigger render={trigger} /> : null}
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          className="fixed inset-0 z-40 bg-background/70 backdrop-blur-sm motion-reduce:backdrop-blur-none"
          data-slot="command-palette-backdrop"
        />
        <DialogPrimitive.Popup
          aria-modal={true}
          className="panel fixed z-50 grid max-h-[min(82dvh,36rem)] w-[min(35rem,calc(100vw-var(--space-6)))] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden shadow-overlay outline-none sm:left-1/2 sm:top-24 sm:-translate-x-1/2 max-sm:inset-0 max-sm:h-dvh max-sm:max-h-dvh max-sm:w-full max-sm:rounded-none max-sm:border-0"
          data-slot="command-palette"
          initialFocus={true}
        >
          <DialogPrimitive.Title className="sr-only">
            Command palette
          </DialogPrimitive.Title>
          <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-[var(--panel-solid)]/95 px-3 py-3">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <Input
              aria-activedescendant={activeOptionId}
              aria-controls={listboxId}
              aria-expanded={true}
              aria-label="Command search"
              className="border-0 bg-transparent px-0 shadow-none focus-visible:shadow-none"
              onChange={(event) => {
                setQuery(event.currentTarget.value);
                setActiveIndex(0);
              }}
              onKeyDown={handleInputKeyDown}
              placeholder={placeholder}
              role="combobox"
              value={query}
            />
            {query.length > 0 ? (
              <Button
                aria-label="Clear command search"
                onClick={() => setQuery("")}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <X aria-hidden="true" />
              </Button>
            ) : (
              <DialogPrimitive.Close
                aria-label="Close command palette"
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-control text-muted-foreground outline-none transition-colors hover:bg-primary/10 hover:text-foreground focus-visible:shadow-[var(--focus-ring-shadow)]"
              >
                <X aria-hidden="true" className="size-4" />
              </DialogPrimitive.Close>
            )}
          </header>

          <div className="min-h-0 overflow-y-auto px-2 py-3">
            {error ? <Alert tone="danger">{error}</Alert> : null}
            {loading ? (
              <div aria-busy="true" className="grid gap-2">
                <Skeleton variant="table-row" />
                <Skeleton variant="table-row" />
                <Skeleton variant="table-row" />
              </div>
            ) : visibleItems.length === 0 ? (
              <EmptyState
                action={
                  emptyAction ? (
                    <Button
                      onClick={() => runItem(emptyAction)}
                      type="button"
                      variant="secondary"
                    >
                      {emptyAction.label}
                    </Button>
                  ) : null
                }
                title="No matches"
              >
                {query.length > 0
                  ? `No command matches "${query}".`
                  : "No commands are available yet."}
              </EmptyState>
            ) : (
              <div aria-label="Command results" id={listboxId} role="listbox">
                {filteredGroups.map((group) => (
                  <section
                    aria-label={group.label}
                    className="grid gap-1 py-1"
                    key={group.label}
                  >
                    <h3 className="px-2 py-1 font-mono text-xs uppercase tracking-[0.18em] text-ink-4">
                      {group.label}
                    </h3>
                    {group.items.map((item) => {
                      const index = visibleItems.findIndex(
                        (candidate) => candidate.id === item.id,
                      );
                      const active = index === activeIndex;
                      return (
                        <button
                          aria-disabled={item.disabled ? true : undefined}
                          aria-selected={active}
                          className={cn(
                            "grid min-h-12 w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-control border border-transparent px-3 py-2 text-left outline-none transition-[background-color,border-color,box-shadow,color] focus-visible:shadow-[var(--focus-ring-shadow)]",
                            active
                              ? "border-primary/40 bg-primary/10 text-foreground"
                              : "text-muted-foreground hover:bg-primary/5 hover:text-foreground",
                            item.disabled && "pointer-events-none opacity-50",
                          )}
                          disabled={item.disabled}
                          id={`${listboxId}-${item.id}`}
                          key={item.id}
                          onClick={() => runItem(item)}
                          onMouseEnter={() => setActiveIndex(index)}
                          role="option"
                          type="button"
                        >
                          <span className="flex size-8 items-center justify-center rounded-control border border-border bg-elevated text-primary shadow-[var(--bevel)] [&_svg:not([class*='size-'])]:size-4">
                            {item.icon ?? <Search aria-hidden="true" />}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold text-foreground">
                              {item.label}
                            </span>
                            {item.description ? (
                              <span className="block truncate text-xs text-muted-foreground">
                                {item.description}
                              </span>
                            ) : null}
                          </span>
                          {item.shortcut ? (
                            <kbd className="kbd shrink-0 rounded-control border border-border px-2 py-1 text-xs">
                              {item.shortcut}
                            </kbd>
                          ) : null}
                        </button>
                      );
                    })}
                  </section>
                ))}
              </div>
            )}
          </div>

          <footer className="sticky bottom-0 z-10 border-t border-border bg-[var(--panel-solid)]/95 px-3 py-2 text-xs text-muted-foreground max-sm:hidden">
            <span className="kbd">Up/Down</span> navigate ·{" "}
            <span className="kbd">Enter</span> select ·{" "}
            <span className="kbd">Esc</span> close
          </footer>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function filterCommandItems(
  items: readonly CommandPaletteItem[],
  query: string,
): readonly CommandPaletteGroup[] {
  const normalizedQuery = normalizeCommandText(query);
  const groups = new Map<string, CommandPaletteItem[]>();

  for (const item of items) {
    if (
      normalizedQuery.length > 0 &&
      !normalizeCommandText(
        `${textFromNode(item.label)} ${textFromNode(item.description)} ${(item.keywords ?? []).join(" ")}`,
      ).includes(normalizedQuery)
    ) {
      continue;
    }

    const group = groups.get(item.group) ?? [];
    group.push(item);
    groups.set(item.group, group);
  }

  return Array.from(groups, ([label, groupItems]) => ({
    items: groupItems,
    label,
  }));
}

function normalizeCommandText(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function textFromNode(node: ReactNode): string {
  return typeof node === "string" || typeof node === "number"
    ? String(node)
    : "";
}

export { CommandPalette, filterCommandItems };
export type { CommandPaletteItem, CommandPaletteProps };
