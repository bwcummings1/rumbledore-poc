"use client";

import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { Check, Minus } from "lucide-react";
import { type ReactNode, useId } from "react";

import { cn } from "@/lib/utils";

interface CheckboxProps extends CheckboxPrimitive.Root.Props {
  readonly description?: ReactNode;
  readonly label?: ReactNode;
}

function Checkbox({
  "aria-describedby": ariaDescribedBy,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  className,
  description,
  indeterminate,
  label,
  ...props
}: CheckboxProps) {
  const id = useId();
  const labelId = label ? `${id}-label` : undefined;
  const descriptionId = description ? `${id}-description` : undefined;
  const control = (
    <CheckboxPrimitive.Root
      aria-describedby={cn(ariaDescribedBy, descriptionId)}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy ?? (ariaLabel ? undefined : labelId)}
      className={cn(
        "group/checkbox inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-control border border-transparent text-primary-foreground outline-none transition-[box-shadow,color] focus-visible:shadow-[var(--focus-ring-shadow)] data-[disabled]:opacity-50",
        className,
      )}
      data-slot="checkbox"
      indeterminate={indeterminate}
      {...props}
    >
      <span
        aria-hidden="true"
        className="inline-flex size-5 items-center justify-center rounded-control border border-input bg-[var(--panel-2)] shadow-[var(--bevel)] transition-[background-color,border-color] group-data-[checked]/checkbox:border-primary group-data-[checked]/checkbox:bg-primary group-data-[indeterminate]/checkbox:border-primary group-data-[indeterminate]/checkbox:bg-primary"
      >
        <CheckboxPrimitive.Indicator keepMounted={true}>
          {indeterminate ? (
            <Minus aria-hidden="true" className="size-3.5" />
          ) : (
            <Check aria-hidden="true" className="size-3.5" />
          )}
        </CheckboxPrimitive.Indicator>
      </span>
    </CheckboxPrimitive.Root>
  );

  if (!label && !description) {
    return control;
  }

  return (
    <div className="flex min-h-11 items-start gap-3 text-sm text-foreground has-data-[disabled]:opacity-60">
      <span className="flex min-h-11 items-center">{control}</span>
      <span className="grid gap-1 py-1.5">
        {label ? (
          <span className="font-medium" id={labelId}>
            {label}
          </span>
        ) : null}
        {description ? (
          <span className="text-muted-foreground" id={descriptionId}>
            {description}
          </span>
        ) : null}
      </span>
    </div>
  );
}

export { Checkbox };
export type { CheckboxProps };
