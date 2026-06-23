import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { type DataCardRow, DataCardTable } from "./data-card-table";

type SortDirection = "asc" | "desc" | "none";
type CellTone = "default" | "money" | "negative" | "positive" | "muted";

interface DataTableColumn<T> {
  readonly align?: "left" | "right";
  readonly cell: (row: T) => ReactNode;
  readonly id: string;
  readonly header: ReactNode;
  readonly priority?: "core" | "desktop";
  readonly sortable?: boolean;
}

interface DataTableSort {
  readonly columnId: string;
  readonly direction: Exclude<SortDirection, "none">;
}

interface DataTableProps<T> {
  readonly ariaLabel: string;
  readonly caption?: ReactNode;
  readonly className?: string;
  readonly columns: readonly DataTableColumn<T>[];
  readonly empty?: ReactNode;
  readonly error?: ReactNode;
  readonly getRowId: (row: T) => string;
  readonly getRowName: (row: T) => ReactNode;
  readonly loading?: boolean;
  readonly mobileRows?: readonly DataCardRow[];
  readonly onSortChange?: (sort: DataTableSort | null) => void;
  readonly rows: readonly T[];
  readonly selectedRowIds?: readonly string[];
  readonly skeletonRowCount?: number;
  readonly sort?: DataTableSort | null;
}

const cellToneClasses: Record<CellTone, string> = {
  default: "text-foreground",
  money: "lcd",
  muted: "text-muted-foreground",
  negative: "metric text-negative",
  positive: "metric text-positive",
};

function DataTable<T>({
  ariaLabel,
  caption,
  className,
  columns,
  empty,
  error,
  getRowId,
  getRowName,
  loading = false,
  mobileRows,
  onSortChange,
  rows,
  selectedRowIds = [],
  skeletonRowCount = 3,
  sort,
}: DataTableProps<T>) {
  const selected = new Set(selectedRowIds);
  const resolvedMobileRows =
    mobileRows ??
    rows.map((row) => ({
      cells: columns.slice(1).map((column) => ({
        label: column.header,
        value: column.cell(row),
      })),
      id: getRowId(row),
      selected: selected.has(getRowId(row)),
      title: getRowName(row),
    }));

  return (
    <section className={cn("grid gap-3", className)} data-slot="data-table">
      {error ? (
        <div
          className="rounded-control border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          data-slot="data-table-error"
          role="alert"
        >
          {error}
        </div>
      ) : null}
      <div className="hidden overflow-hidden rounded-card border border-[var(--hair-2)] bg-[var(--panel)] shadow-[var(--bevel)] sm:block">
        <table
          aria-label={ariaLabel}
          className="w-full text-left text-sm text-ink-2"
        >
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <thead>
            <tr>
              {columns.map((column) => {
                const direction = sortDirectionForColumn(sort, column.id);
                return (
                  <th
                    aria-sort={
                      column.sortable ? ariaSortValue(direction) : undefined
                    }
                    className={cn(
                      "border-b border-[var(--hair)] px-2.5 pt-3 pb-2.5 font-mono text-xs font-normal uppercase tracking-[0.12em] text-ink-4",
                      column.align === "right" ? "text-right" : "text-left",
                      column.priority === "desktop"
                        ? "hidden lg:table-cell"
                        : "",
                    )}
                    key={column.id}
                    scope="col"
                  >
                    {column.sortable ? (
                      <button
                        className={cn(
                          "inline-flex items-center gap-1 rounded-control outline-none transition-colors hover:text-ink-2 focus-visible:shadow-[var(--focus-ring-shadow)]",
                          column.align === "right" ? "justify-end" : "",
                        )}
                        onClick={() =>
                          onSortChange?.(nextSort(sort, column.id))
                        }
                        type="button"
                      >
                        <span>{column.header}</span>
                        <SortIcon direction={direction} />
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from(
                { length: skeletonRowCount },
                (_, index) => `skeleton-${index}`,
              ).map((key) => (
                <tr key={key}>
                  <td className="px-3 py-3" colSpan={columns.length}>
                    <span className="block h-5 rounded-control bg-elevated motion-safe:animate-pulse motion-reduce:animate-none" />
                  </td>
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td
                  className="px-3 py-4 text-sm text-muted-foreground"
                  colSpan={columns.length}
                >
                  {empty}
                </td>
              </tr>
            ) : (
              rows.map((row, index) => {
                const rowId = getRowId(row);
                const isSelected = selected.has(rowId);
                return (
                  <tr
                    className={cn(
                      "border-t border-[var(--hair)] transition-colors hover:bg-primary/5",
                      isSelected ? "bg-primary/10" : "",
                    )}
                    data-selected={isSelected ? "true" : undefined}
                    // biome-ignore lint/suspicious/noArrayIndexKey: row IDs can repeat in imported records; index is a final disambiguator.
                    key={`${rowId}:${index}`}
                  >
                    {columns.map((column) => (
                      <td
                        className={cn(
                          "px-2.5 py-2.5 align-middle",
                          column.align === "right" ? "text-right" : "",
                          column.priority === "desktop"
                            ? "hidden lg:table-cell"
                            : "",
                        )}
                        key={column.id}
                      >
                        {column.cell(row)}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <div className="sm:hidden">
        <DataCardTable
          empty={empty}
          label={`${ariaLabel} mobile cards`}
          rows={loading ? [] : resolvedMobileRows}
        />
      </div>
    </section>
  );
}

function SignedValue({
  children,
  className,
  tone,
}: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly tone: CellTone;
}) {
  return (
    <span
      className={cn(cellToneClasses[tone], className)}
      data-slot="signed-value"
    >
      {children}
    </span>
  );
}

function SortIcon({ direction }: { readonly direction: SortDirection }) {
  if (direction === "asc") {
    return <ArrowUp aria-hidden="true" className="size-3 text-primary" />;
  }
  if (direction === "desc") {
    return <ArrowDown aria-hidden="true" className="size-3 text-primary" />;
  }
  return <ChevronsUpDown aria-hidden="true" className="size-3" />;
}

function sortDirectionForColumn(
  sort: DataTableSort | null | undefined,
  columnId: string,
): SortDirection {
  if (!sort || sort.columnId !== columnId) {
    return "none";
  }

  return sort.direction;
}

function ariaSortValue(
  direction: SortDirection,
): "ascending" | "descending" | "none" {
  if (direction === "asc") {
    return "ascending";
  }
  if (direction === "desc") {
    return "descending";
  }
  return "none";
}

function nextSort(
  sort: DataTableSort | null | undefined,
  columnId: string,
): DataTableSort | null {
  if (!sort || sort.columnId !== columnId) {
    return { columnId, direction: "asc" };
  }

  if (sort.direction === "asc") {
    return { columnId, direction: "desc" };
  }

  return null;
}

export { DataTable, SignedValue, nextSort };
export type {
  CellTone,
  DataTableColumn,
  DataTableProps,
  DataTableSort,
  SortDirection,
};
