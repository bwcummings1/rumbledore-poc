"use client";

import { ChevronRight, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Button } from "./button";
import { Popover } from "./popover";

interface BreadcrumbItem {
  readonly current?: boolean;
  readonly href?: string;
  readonly label: ReactNode;
}

interface BreadcrumbsProps {
  readonly className?: string;
  readonly items: readonly BreadcrumbItem[];
  readonly label?: string;
}

function Breadcrumbs({
  className,
  items,
  label = "Breadcrumb",
}: BreadcrumbsProps) {
  if (items.length === 0) {
    return null;
  }

  const first = items[0];
  const current = items[items.length - 1];
  const hidden = items.slice(1, -1);
  const middle = items.slice(1, -1);

  return (
    <nav
      aria-label={label}
      className={cn("min-w-0", className)}
      data-slot="breadcrumbs"
    >
      <ol className="flex min-w-0 items-center gap-1 text-sm">
        <BreadcrumbListItem item={first} />
        {hidden.length > 0 ? (
          <>
            <li aria-hidden="true" className="text-muted-foreground/70">
              <ChevronRight className="size-4" />
            </li>
            <li className="sm:hidden">
              <Popover
                title="Path"
                trigger={
                  <Button
                    aria-label="Show hidden breadcrumbs"
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  >
                    <MoreHorizontal aria-hidden="true" />
                  </Button>
                }
              >
                <ol className="grid gap-1">
                  {hidden.map((item, index) => (
                    <li key={breadcrumbKey(item, index)}>
                      <BreadcrumbLink item={item} mobile={true} />
                    </li>
                  ))}
                </ol>
              </Popover>
            </li>
            {middle.map((item, index) => (
              <BreadcrumbListItem
                className="max-sm:hidden"
                item={item}
                key={breadcrumbKey(item, index)}
              />
            ))}
          </>
        ) : null}
        {items.length > 1 ? (
          <>
            <li aria-hidden="true" className="text-muted-foreground/70">
              <ChevronRight className="size-4" />
            </li>
            <BreadcrumbListItem item={{ ...current, current: true }} />
          </>
        ) : null}
      </ol>
    </nav>
  );
}

function BreadcrumbListItem({
  className,
  item,
}: {
  readonly className?: string;
  readonly item: BreadcrumbItem;
}) {
  return (
    <li className={cn("flex min-w-0 items-center gap-1", className)}>
      <BreadcrumbLink item={item} />
    </li>
  );
}

function BreadcrumbLink({
  item,
  mobile = false,
}: {
  readonly item: BreadcrumbItem;
  readonly mobile?: boolean;
}) {
  const className = cn(
    "min-w-0 truncate rounded-control px-2 py-1 font-display text-xs uppercase tracking-normal outline-none focus-visible:shadow-[var(--focus-ring-shadow)]",
    item.current
      ? "text-foreground"
      : "text-muted-foreground transition-colors hover:text-foreground",
    mobile && "block min-h-10 px-3 py-2 text-sm normal-case",
  );

  if (!item.href || item.current) {
    return (
      <span
        aria-current={item.current ? "page" : undefined}
        className={className}
      >
        {item.label}
      </span>
    );
  }

  return (
    <Link className={className} href={item.href}>
      {item.label}
    </Link>
  );
}

function breadcrumbKey(item: BreadcrumbItem, index: number): string {
  return `${item.href ?? "crumb"}-${String(item.label)}-${index}`;
}

export { Breadcrumbs };
export type { BreadcrumbItem, BreadcrumbsProps };
