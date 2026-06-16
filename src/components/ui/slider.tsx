"use client";

import { Slider as SliderPrimitive } from "@base-ui/react/slider";

import { cn } from "@/lib/utils";

interface SliderProps extends SliderPrimitive.Root.Props<number | number[]> {
  readonly showValue?: boolean;
  readonly valueLabel?: (value: readonly number[]) => string;
}

function Slider({
  "aria-label": ariaLabel,
  className,
  defaultValue,
  showValue = true,
  value,
  valueLabel,
  ...props
}: SliderProps) {
  const values = Array.isArray(value)
    ? value
    : Array.isArray(defaultValue)
      ? defaultValue
      : [value ?? defaultValue ?? props.min ?? 0];
  const thumbs = values.map((_, index) => ({
    index,
    key: `thumb-${index}`,
  }));

  return (
    <SliderPrimitive.Root
      className={cn("grid gap-2", className)}
      aria-label={ariaLabel}
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      {...props}
    >
      <SliderPrimitive.Control className="relative flex min-h-11 items-center">
        <SliderPrimitive.Track className="relative h-2 w-full overflow-hidden rounded-full bg-[var(--hair-2)]">
          <SliderPrimitive.Indicator className="absolute h-full rounded-full bg-primary shadow-[0_0_16px_var(--glow-lilac)]" />
        </SliderPrimitive.Track>
        {thumbs.map((thumb) => (
          <SliderPrimitive.Thumb
            className="size-6 rounded-full border border-[var(--line-2)] bg-foreground shadow-[var(--bevel),var(--focus-ring-shadow)] outline-none focus-visible:shadow-[var(--focus-ring-shadow),var(--bevel)]"
            getAriaLabel={(thumbIndex) =>
              typeof ariaLabel === "string" && values.length === 1
                ? ariaLabel
                : values.length > 1
                  ? `Slider thumb ${thumbIndex + 1}`
                  : "Slider value"
            }
            index={thumb.index}
            key={thumb.key}
          />
        ))}
      </SliderPrimitive.Control>
      {showValue ? (
        <SliderPrimitive.Value className="metric justify-self-end rounded-control border border-input bg-[var(--panel-2)] px-2 py-1 text-xs text-foreground">
          {(_formatted, currentValues) =>
            valueLabel ? valueLabel(currentValues) : currentValues.join(" - ")
          }
        </SliderPrimitive.Value>
      ) : null}
    </SliderPrimitive.Root>
  );
}

export { Slider };
export type { SliderProps };
