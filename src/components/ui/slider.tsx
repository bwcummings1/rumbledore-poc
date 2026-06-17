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
      <SliderPrimitive.Control className="relative flex min-h-8 items-center">
        <SliderPrimitive.Track className="relative h-1 w-full overflow-hidden rounded-full bg-white/[0.08]">
          <SliderPrimitive.Indicator className="absolute h-full rounded-full bg-primary shadow-[0_0_8px_var(--glow-lilac)]" />
        </SliderPrimitive.Track>
        {thumbs.map((thumb) => (
          <SliderPrimitive.Thumb
            className="size-4 rounded-full border-2 border-[var(--void-2)] bg-lilac-hi shadow-[0_0_10px_var(--glow-lilac)] outline-none focus-visible:shadow-[var(--focus-ring-shadow)]"
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
        <SliderPrimitive.Value className="metric justify-self-end rounded-control border border-[var(--hair-2)] bg-[var(--control-inset)] px-2 py-1 text-xs text-warning">
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
