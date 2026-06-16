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
            className="flex min-h-11 cursor-pointer items-start gap-3 rounded-control border border-input bg-[var(--panel-2)] px-3 py-2 text-sm text-foreground shadow-[var(--bevel)] transition-[background-color,border-color] has-data-[checked]:border-primary has-data-[checked]:bg-primary/10 has-data-[disabled]:cursor-not-allowed has-data-[disabled]:opacity-50"
            key={option.value}
          >
            <span className="flex min-h-6 items-center">
              <RadioPrimitive.Root
                aria-describedby={descriptionId}
                aria-labelledby={labelId}
                className="inline-flex size-5 items-center justify-center rounded-full border border-input bg-[var(--panel)] outline-none transition-[border-color,box-shadow] data-[checked]:border-primary focus-visible:shadow-[var(--focus-ring-shadow),var(--bevel)]"
                data-slot="radio"
                disabled={option.disabled}
                value={option.value}
              >
                <RadioPrimitive.Indicator className="size-2.5 rounded-full bg-primary shadow-[0_0_12px_var(--glow-lilac)]" />
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
