"use client";

import { Radio as RadioPrimitive } from "@base-ui/react/radio";
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group";
import { type ReactNode, useId } from "react";

import { cn } from "@/lib/utils";

interface SegmentedOption {
  readonly disabled?: boolean;
  readonly icon?: ReactNode;
  readonly label: ReactNode;
  readonly value: string;
}

interface SegmentedProps
  extends Omit<RadioGroupPrimitive.Props<string>, "children"> {
  readonly options: readonly SegmentedOption[];
}

function Segmented({ className, options, ...props }: SegmentedProps) {
  const id = useId();

  return (
    <RadioGroupPrimitive
      className={cn(
        "grid min-h-11 grid-flow-col auto-cols-fr overflow-hidden rounded-control border border-input bg-[var(--panel-2)] p-1 shadow-[var(--bevel)]",
        className,
      )}
      data-slot="segmented"
      {...props}
    >
      {options.map((option, index) => {
        const labelId = `${id}-${index}`;
        return (
          <RadioPrimitive.Root
            aria-labelledby={labelId}
            className="inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-control px-3 text-center text-sm font-medium text-muted-foreground outline-none transition-[background-color,box-shadow,color] data-[checked]:bg-primary/15 data-[checked]:text-foreground data-[checked]:shadow-[var(--bevel)] focus-visible:shadow-[var(--focus-ring-shadow),var(--bevel)] data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
            data-slot="segmented-option"
            disabled={option.disabled}
            key={option.value}
            value={option.value}
          >
            {option.icon ? (
              <span className="shrink-0 [&_svg:not([class*='size-'])]:size-4">
                {option.icon}
              </span>
            ) : null}
            <span className="truncate" id={labelId}>
              {option.label}
            </span>
          </RadioPrimitive.Root>
        );
      })}
    </RadioGroupPrimitive>
  );
}

export { Segmented };
export type { SegmentedOption, SegmentedProps };
