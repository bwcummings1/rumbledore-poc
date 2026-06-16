import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { cn } from "@/lib/utils";

type KVTone = "default" | "money" | "positive" | "negative" | "muted";

interface KVItem {
  readonly label: ReactNode;
  readonly value: ReactNode;
  readonly tone?: KVTone;
}

interface KVListProps extends ComponentPropsWithoutRef<"dl"> {
  readonly items?: readonly KVItem[];
}

interface KVRowProps extends ComponentPropsWithoutRef<"div"> {
  readonly label: ReactNode;
  readonly tone?: KVTone;
  readonly value: ReactNode;
}

const toneClasses: Record<KVTone, string> = {
  default: "text-foreground",
  money: "lcd",
  muted: "text-muted-foreground",
  negative: "metric text-negative",
  positive: "metric text-positive",
};

function KVList({ children, className, items, ...props }: KVListProps) {
  return (
    <dl
      className={cn("divide-y divide-border rounded-control", className)}
      data-slot="kv-list"
      {...props}
    >
      {items
        ? items.map((item, index) => (
            <KVRow
              // biome-ignore lint/suspicious/noArrayIndexKey: KV rows are display-only and caller labels can repeat.
              key={index}
              label={item.label}
              tone={item.tone}
              value={item.value}
            />
          ))
        : children}
    </dl>
  );
}

function KVRow({
  className,
  label,
  tone = "default",
  value,
  ...props
}: KVRowProps) {
  return (
    <div
      className={cn(
        "grid gap-1 py-2 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-baseline sm:gap-4",
        className,
      )}
      data-slot="kv-row"
      {...props}
    >
      <dt className="eyebrow min-w-0 truncate" data-slot="kv-label">
        {label}
      </dt>
      <dd
        className={cn(
          "min-w-0 break-words text-sm font-medium sm:text-right",
          toneClasses[tone],
        )}
        data-slot="kv-value"
      >
        {value}
      </dd>
    </div>
  );
}

export { KVList, KVRow };
export type { KVItem, KVListProps, KVRowProps, KVTone };
