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
  default: "metric text-foreground",
  money: "metric text-warning",
  muted: "metric text-ink-3",
  negative: "metric text-coral",
  positive: "metric text-jade",
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
      <dt
        className="min-w-0 truncate font-mono text-xs uppercase tracking-[0.12em] text-ink-3"
        data-slot="kv-label"
      >
        {label}
      </dt>
      <dd
        className={cn(
          "min-w-0 break-words text-sm sm:text-right",
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
