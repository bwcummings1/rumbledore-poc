import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { cn } from "@/lib/utils";
import { type KVItem, KVList } from "./kv";

interface DataCardRow {
  readonly actions?: ReactNode;
  readonly cells: readonly KVItem[];
  readonly id: string;
  readonly leading?: ReactNode;
  readonly meta?: ReactNode;
  readonly selected?: boolean;
  readonly title: ReactNode;
}

interface DataCardTableProps extends ComponentPropsWithoutRef<"ul"> {
  readonly empty?: ReactNode;
  readonly label: string;
  readonly rows: readonly DataCardRow[];
}

function DataCardTable({
  className,
  empty,
  label,
  rows,
  ...props
}: DataCardTableProps) {
  if (rows.length === 0) {
    return (
      <div className={cn("cell p-4 text-sm text-muted-foreground", className)}>
        {empty}
      </div>
    );
  }

  return (
    <ul
      aria-label={label}
      className={cn("grid gap-3", className)}
      data-slot="data-card-table"
      {...props}
    >
      {rows.map((row) => (
        <li
          aria-label={textFromNode(row.title)}
          className={cn(
            "cell grid gap-3 p-3",
            row.selected
              ? "border-primary bg-primary/10 shadow-[0_0_16px_var(--glow-lilac),var(--bevel)]"
              : "",
          )}
          data-selected={row.selected ? "true" : undefined}
          data-slot="data-card-row"
          key={row.id}
        >
          <div className="flex items-start gap-3">
            {row.leading ? <div className="shrink-0">{row.leading}</div> : null}
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm font-semibold">{row.title}</h3>
              {row.meta ? (
                <p className="mt-1 text-xs text-muted-foreground">{row.meta}</p>
              ) : null}
            </div>
            {row.actions ? <div className="shrink-0">{row.actions}</div> : null}
          </div>
          <KVList items={row.cells} />
        </li>
      ))}
    </ul>
  );
}

function textFromNode(node: ReactNode): string | undefined {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  return undefined;
}

export { DataCardTable };
export type { DataCardRow, DataCardTableProps };
