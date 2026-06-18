"use client";

import { Radio as RadioPrimitive } from "@base-ui/react/radio";
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group";
import { type ReactNode, useId } from "react";

import { cn } from "@/lib/utils";

interface RadioOption {
  readonly description?: ReactNode;
  readonly disabled?: boolean;
  readonly label: ReactNode;
  readonly value: string;
}

interface RadioGroupProps
  extends Omit<RadioGroupPrimitive.Props<string>, "children"> {
  readonly options: readonly RadioOption[];
}

function RadioGroup({ className, options, ...props }: RadioGroupProps) {
  const id = useId();

  return (
    <RadioGroupPrimitive
      className={cn("grid gap-2", className)}
      data-slot="radio-group"
      {...props}
    >
      {options.map((option, index) => {
        const labelId = `${id}-${index}`;
        const descriptionId = option.description
          ? `${id}-${index}-description`
          : undefined;
        return (
          <div
            className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-[var(--hair-2)] bg-white/[0.015] px-3 py-2.5 text-sm text-foreground transition-[background-color,border-color] has-data-[checked]:border-primary/60 has-data-[checked]:bg-primary/10 has-data-[disabled]:cursor-not-allowed has-data-[disabled]:opacity-50"
            key={option.value}
          >
            <span className="flex min-h-5 items-center">
              <RadioPrimitive.Root
                aria-describedby={descriptionId}
                aria-labelledby={labelId}
                className="group/radio inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-transparent outline-none transition-[box-shadow] focus-visible:shadow-[var(--focus-ring-shadow)]"
                data-slot="radio"
                disabled={option.disabled}
                value={option.value}
              >
                <span
                  aria-hidden="true"
                  className="inline-flex size-[1.125rem] items-center justify-center rounded-full border border-[var(--hair-3)] bg-[var(--control-inset)] transition-[background-color,border-color] group-data-[checked]/radio:border-primary group-data-[checked]/radio:bg-primary/25"
                >
                  <RadioPrimitive.Indicator className="size-2 rounded-full bg-lilac-hi shadow-[0_0_8px_var(--glow-lilac)]" />
                </span>
              </RadioPrimitive.Root>
            </span>
            <span className="grid gap-1">
              <span className="font-medium" id={labelId}>
                {option.label}
              </span>
              {option.description ? (
                <span className="text-muted-foreground" id={descriptionId}>
                  {option.description}
                </span>
              ) : null}
            </span>
          </div>
        );
      })}
    </RadioGroupPrimitive>
  );
}

export { RadioGroup };
export type { RadioGroupProps, RadioOption };
