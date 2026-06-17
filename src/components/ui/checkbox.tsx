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
        "group/checkbox inline-flex shrink-0 items-center justify-center rounded-control border border-transparent text-lilac-hi outline-none transition-[box-shadow,color] focus-visible:shadow-[var(--focus-ring-shadow)] data-[disabled]:opacity-50",
        className,
      )}
      data-slot="checkbox"
      indeterminate={indeterminate}
      {...props}
    >
      <span
        aria-hidden="true"
        className="inline-flex size-[1.125rem] items-center justify-center rounded-control border border-[var(--hair-3)] bg-[var(--control-inset)] shadow-[var(--bevel)] transition-[background-color,border-color] group-data-[checked]/checkbox:border-primary group-data-[checked]/checkbox:bg-primary/25 group-data-[indeterminate]/checkbox:border-primary group-data-[indeterminate]/checkbox:bg-primary/25"
      >
        <CheckboxPrimitive.Indicator keepMounted={true}>
          {indeterminate ? (
            <Minus aria-hidden="true" className="size-3" />
          ) : (
            <Check aria-hidden="true" className="size-3" />
          )}
        </CheckboxPrimitive.Indicator>
      </span>
    </CheckboxPrimitive.Root>
  );

  if (!label && !description) {
    return control;
  }

  return (
    <div className="flex items-start gap-3 text-sm text-foreground has-data-[disabled]:opacity-60">
      <span className="flex items-center">{control}</span>
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
