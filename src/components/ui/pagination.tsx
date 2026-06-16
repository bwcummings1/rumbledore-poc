"use client";

import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import type { ChangeEvent, ComponentPropsWithoutRef, ReactNode } from "react";

import { cn } from "@/lib/utils";

interface PaginationPage {
  readonly ariaLabel?: string;
  readonly href?: string;
  readonly label?: ReactNode;
  readonly page: number;
}

interface PaginationProps extends ComponentPropsWithoutRef<"nav"> {
  readonly currentPage: number;
  readonly mobileSelectLabel?: string;
  readonly onPageChange?: (page: number) => void;
  readonly pages: readonly PaginationPage[];
  readonly siblingCount?: number;
}

type PaginationRangeItem = number | "ellipsis-left" | "ellipsis-right";

const paginationControlClass =
  "inline-flex size-11 min-h-11 min-w-11 items-center justify-center rounded-control border border-input bg-[var(--panel)] px-2 font-mono text-sm text-muted-foreground shadow-[var(--bevel)] outline-none transition-[background-color,border-color,color,box-shadow] hover:border-[var(--hair-3)] hover:bg-elevated hover:text-foreground focus-visible:shadow-[var(--focus-ring-shadow),var(--bevel)] aria-current:bg-primary/15 aria-current:text-foreground aria-disabled:pointer-events-none aria-disabled:opacity-50";

function Pagination({
  className,
  currentPage,
  mobileSelectLabel = "Jump to page",
  onPageChange,
  pages,
  siblingCount = 1,
  ...props
}: PaginationProps) {
  if (pages.length === 0) {
    return null;
  }

  const normalizedCurrentPage = clampPage(currentPage, pages);
  const currentIndex = pages.findIndex(
    (page) => page.page === normalizedCurrentPage,
  );
  const previousPage = currentIndex > 0 ? pages[currentIndex - 1] : null;
  const nextPage =
    currentIndex >= 0 && currentIndex < pages.length - 1
      ? pages[currentIndex + 1]
      : null;
  const pageNumbers = pages.map((page) => page.page);
  const range = paginationRange({
    currentPage: normalizedCurrentPage,
    pageNumbers,
    siblingCount,
  });

  function handleMobileChange(event: ChangeEvent<HTMLSelectElement>) {
    const nextPageNumber = Number(event.currentTarget.value);
    const page = pages.find((candidate) => candidate.page === nextPageNumber);
    if (!page) {
      return;
    }
    onPageChange?.(page.page);
    if (page.href) {
      window.location.assign(page.href);
    }
  }

  return (
    <nav
      aria-label={props["aria-label"] ?? "Pagination"}
      className={cn("grid gap-2", className)}
      data-slot="pagination"
      {...props}
    >
      <div className="hidden items-center gap-1 sm:flex">
        <PaginationButton
          ariaLabel="Previous page"
          disabled={!previousPage}
          href={previousPage?.href}
          onClick={() => previousPage && onPageChange?.(previousPage.page)}
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
        </PaginationButton>
        {range.map((item) =>
          typeof item === "number" ? (
            <PaginationButton
              ariaCurrent={item === normalizedCurrentPage}
              ariaLabel={
                pages.find((page) => page.page === item)?.ariaLabel ??
                `Page ${item}`
              }
              href={pages.find((page) => page.page === item)?.href}
              key={item}
              onClick={() => onPageChange?.(item)}
            >
              {item}
            </PaginationButton>
          ) : (
            <span
              aria-hidden="true"
              className="inline-flex size-10 items-center justify-center text-muted-foreground"
              key={item}
            >
              <MoreHorizontal className="size-4" />
            </span>
          ),
        )}
        <PaginationButton
          ariaLabel="Next page"
          disabled={!nextPage}
          href={nextPage?.href}
          onClick={() => nextPage && onPageChange?.(nextPage.page)}
        >
          <ChevronRight aria-hidden="true" className="size-4" />
        </PaginationButton>
      </div>

      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 sm:hidden">
        <PaginationButton
          ariaLabel="Previous page"
          disabled={!previousPage}
          href={previousPage?.href}
          onClick={() => previousPage && onPageChange?.(previousPage.page)}
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
        </PaginationButton>
        <label className="min-w-0">
          <span className="sr-only">{mobileSelectLabel}</span>
          <select
            aria-label={mobileSelectLabel}
            className="h-11 w-full rounded-control border border-input bg-[var(--panel-2)] px-3 text-center font-mono text-sm text-foreground shadow-[var(--bevel)] outline-none focus-visible:shadow-[var(--focus-ring-shadow),var(--bevel)]"
            onChange={handleMobileChange}
            value={normalizedCurrentPage}
          >
            {pages.map((page) => (
              <option key={page.page} value={page.page}>
                Page {page.page} / {pages.length}
                {typeof page.label === "string" ? ` - ${page.label}` : ""}
              </option>
            ))}
          </select>
        </label>
        <PaginationButton
          ariaLabel="Next page"
          disabled={!nextPage}
          href={nextPage?.href}
          onClick={() => nextPage && onPageChange?.(nextPage.page)}
        >
          <ChevronRight aria-hidden="true" className="size-4" />
        </PaginationButton>
      </div>
    </nav>
  );
}

function PaginationButton({
  ariaCurrent,
  ariaLabel,
  children,
  disabled,
  href,
  onClick,
}: {
  readonly ariaCurrent?: boolean;
  readonly ariaLabel: string;
  readonly children: ReactNode;
  readonly disabled?: boolean;
  readonly href?: string;
  readonly onClick?: () => void;
}) {
  if (href && !disabled) {
    return (
      <Link
        aria-current={ariaCurrent ? "page" : undefined}
        aria-label={ariaLabel}
        className={paginationControlClass}
        href={href}
        onClick={onClick}
      >
        {children}
      </Link>
    );
  }

  return (
    <button
      aria-current={ariaCurrent ? "page" : undefined}
      aria-disabled={disabled ? true : undefined}
      aria-label={ariaLabel}
      className={paginationControlClass}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function clampPage(
  currentPage: number,
  pages: readonly PaginationPage[],
): number {
  if (pages.some((page) => page.page === currentPage)) {
    return currentPage;
  }

  return pages[0]?.page ?? 1;
}

function paginationRange({
  currentPage,
  pageNumbers,
  siblingCount,
}: {
  readonly currentPage: number;
  readonly pageNumbers: readonly number[];
  readonly siblingCount: number;
}): PaginationRangeItem[] {
  if (pageNumbers.length <= 7) {
    return [...pageNumbers];
  }

  const first = pageNumbers[0] ?? 1;
  const last = pageNumbers[pageNumbers.length - 1] ?? first;
  const start = Math.max(currentPage - siblingCount, first + 1);
  const end = Math.min(currentPage + siblingCount, last - 1);
  const range: PaginationRangeItem[] = [first];

  if (start > first + 1) {
    range.push("ellipsis-left");
  }

  for (let page = start; page <= end; page += 1) {
    range.push(page);
  }

  if (end < last - 1) {
    range.push("ellipsis-right");
  }

  range.push(last);
  return range;
}

export { Pagination, paginationRange };
export type { PaginationPage, PaginationProps };
