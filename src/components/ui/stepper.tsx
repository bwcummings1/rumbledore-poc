"use client";

import { NumberField as NumberFieldPrimitive } from "@base-ui/react/number-field";
import { Minus, Plus } from "lucide-react";

import { cn } from "@/lib/utils";

interface StepperProps extends NumberFieldPrimitive.Root.Props {
  readonly inputClassName?: string;
  readonly money?: boolean;
}

function Stepper({
  "aria-label": ariaLabel,
  className,
  inputClassName,
  money = false,
  ...props
}: StepperProps) {
  return (
    <NumberFieldPrimitive.Root
      className={cn("w-full", className)}
      aria-label={ariaLabel}
      data-slot="stepper"
      {...props}
    >
      <NumberFieldPrimitive.Group className="grid min-h-11 grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] overflow-hidden rounded-control border border-input bg-[var(--panel-2)] shadow-[var(--bevel)] focus-within:border-primary data-[disabled]:opacity-50">
        <NumberFieldPrimitive.Decrement
          aria-label="Decrease"
          className="flex min-h-11 items-center justify-center border-input border-r text-muted-foreground transition-[background-color,color] hover:bg-primary/10 hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
        >
          <Minus aria-hidden="true" className="size-4" />
        </NumberFieldPrimitive.Decrement>
        <NumberFieldPrimitive.Input
          aria-label={ariaLabel}
          aria-valuemax={props.max}
          aria-valuemin={props.min}
          aria-valuenow={
            typeof props.value === "number" ? props.value : undefined
          }
          className={cn(
            "min-w-0 bg-transparent px-3 py-2 text-center text-base outline-none",
            money ? "lcd" : "metric",
            inputClassName,
          )}
          data-slot="stepper-input"
          role="spinbutton"
        />
        <NumberFieldPrimitive.Increment
          aria-label="Increase"
          className="flex min-h-11 items-center justify-center border-input border-l text-muted-foreground transition-[background-color,color] hover:bg-primary/10 hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
        >
          <Plus aria-hidden="true" className="size-4" />
        </NumberFieldPrimitive.Increment>
      </NumberFieldPrimitive.Group>
    </NumberFieldPrimitive.Root>
  );
}

export { Stepper };
export type { StepperProps };
